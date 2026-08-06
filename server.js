// ================= IMPORTS =================

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const Database = require("better-sqlite3");

require("dotenv").config();


// ================= APP =================

const app = express();


// ================= MIDDLEWARE =================

app.use(cors());


app.use(
    express.json({
        limit:"10mb"
    })
);


// ================= CONFIG =================

const PORT =
process.env.PORT || 5000;


const SECRET =
process.env.JWT_SECRET || "supersecretkey123";


const FRONTEND_URL =
process.env.FRONTEND_URL ||
"http://localhost:5000";



// ================= STRIPE =================

const stripe =
Stripe(
    process.env.STRIPE_SECRET_KEY
);



// ================= ADMIN =================

const ADMIN_USER = "admin";

const ADMIN_PASS = "123456";



// ================= DATABASE =================


const db =
new Database(
    path.join(
        __dirname,
        "database.db"
    )
);



console.log("✅ SQLite connected");



// ================= CREATE TABLES =================


db.exec(`

CREATE TABLE IF NOT EXISTS bookings(

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT,

email TEXT,

phone TEXT,

address TEXT,

service TEXT,

price REAL,

deposit REAL,

remaining REAL,

date TEXT,

timeSlot TEXT,

status TEXT,

stripeSession TEXT,

createdAt TEXT

);



CREATE TABLE IF NOT EXISTS contracts(

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT,

email TEXT,

phone TEXT,

contractType TEXT,

typedName TEXT,

pdfUrl TEXT,

createdAt TEXT

);



CREATE TABLE IF NOT EXISTS contacts(

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT,

email TEXT,

phone TEXT,

message TEXT,

createdAt TEXT

);


`);



console.log("✅ Database ready");



// ================= EMAIL =================


// Gmail SMTP FIX

// ================= EMAIL =================

const transporter = nodemailer.createTransport({

host: "smtp.gmail.com",

port: 587,

secure: false,

family: 4,

auth: {

user: process.env.EMAIL_USER,

pass: process.env.EMAIL_PASS

},

tls: {

rejectUnauthorized: false

}

});


transporter.verify((error)=>{

if(error){

console.log(
"❌ EMAIL SERVER ERROR:",
error
);

}
else{

console.log(
"✅ EMAIL SERVER READY"
);

}

});
// ================= ADMIN AUTH =================


function verifyAdmin(req,res,next){


const auth =
req.headers.authorization;



if(!auth){

return res.status(401).json({

error:"No token"

});

}



try{


const token =
auth.split(" ")[1];


jwt.verify(

token,

SECRET

);



next();


}

catch(error){


return res.status(401).json({

error:"Invalid token"

});


}


}






// ================= CONTACT =================


app.post(
"/api/contact",
async(req,res)=>{


try{


const {

name,

email,

phone,

message

}=req.body;



console.log("NEW CONTACT:",{

name,

email,

phone,

message

});





if(

!name ||

!email ||

!email.includes("@") ||

!message

){


return res.status(400).json({

success:false,

error:"Missing or invalid fields"

});


}





// SAVE DATABASE


db.prepare(`

INSERT INTO contacts

(

name,

email,

phone,

message,

createdAt

)

VALUES(?,?,?,?,?)

`).run(


name,


email,


phone || "",


message,


new Date().toISOString()


);







// SEND EMAIL TO OWNER


await transporter.sendMail({


from:

process.env.EMAIL_USER,


to:

process.env.EMAIL_USER,



subject:

"New Contact Message - My DMV Cleaning Services LLC",




html:`


<h2>
New Contact Request
</h2>


<hr>


<p>
<b>Name:</b> ${name}
</p>


<p>
<b>Email:</b> ${email}
</p>


<p>
<b>Phone:</b> ${phone || ""}
</p>



<p>
<b>Message:</b>
</p>


<p>
${message}
</p>


<hr>


<p>
My DMV Cleaning Services LLC
</p>


`

});




console.log(
"✅ CONTACT EMAIL SENT"
);




res.json({

success:true

});



}


catch(error){


console.log(

"❌ CONTACT EMAIL ERROR:",

error

);



res.status(500).json({

success:false,

error:"Email failed"

});


}



});







// ================= CHECK BOOKED TIMES =================



app.get(

"/api/bookings-by-date/:date",

(req,res)=>{


try{


const rows =

db.prepare(`

SELECT timeSlot

FROM bookings

WHERE date=?

`)

.all(

req.params.date

);





res.json(

rows.map(

row=>row.timeSlot

)

);



}

catch(error){


console.log(

"BOOKING DATE ERROR:",

error

);


res.json([]);

}


});









// ================= SEND BOOKING EMAIL =================


async function sendBookingEmail(booking){


try{


await transporter.sendMail({


from:

process.env.EMAIL_USER,


to:

booking.email,



subject:

"Booking Confirmation - My DMV Cleaning Services LLC",



html:`


<h2>
✅ Booking Confirmed
</h2>


<p>
Thank you for choosing My DMV Cleaning Services LLC.
</p>


<hr>


<p>
<b>Name:</b> ${booking.name}
</p>


<p>
<b>Service:</b> ${booking.service}
</p>


<p>
<b>Date:</b> ${booking.date}
</p>


<p>
<b>Time:</b> ${booking.timeSlot}
</p>


<p>
<b>Total:</b> $${booking.price}
</p>


<p>
<b>Deposit:</b> $${booking.deposit}
</p>


<p>
<b>Remaining:</b> $${booking.remaining}
</p>


<hr>


<p>
My DMV Cleaning Services LLC
</p>


`

});


console.log(
"✅ BOOKING EMAIL SENT"
);



}

catch(error){


console.log(

"❌ BOOKING EMAIL ERROR:",

error

);


}


}







// ================= PAY LATER BOOKING =================



app.post(

"/api/book-pay-later",

(req,res)=>{


try{


const booking =
req.body;




if(

!booking.name ||

!booking.email ||

!booking.date ||

!booking.timeSlot

){


return res.status(400).json({

error:"Missing booking information"

});


}





const existing =

db.prepare(`

SELECT id

FROM bookings

WHERE date=?

AND timeSlot=?

`)

.get(

booking.date,

booking.timeSlot

);




if(existing){


return res.status(400).json({

error:"Time slot already booked"

});


}





const price =
Number(booking.price);





const result =

db.prepare(`

INSERT INTO bookings

(

name,

email,

phone,

address,

service,

price,

deposit,

remaining,

date,

timeSlot,

status,

stripeSession,

createdAt

)

VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)

`)

.run(


booking.name,


booking.email,


booking.phone || "",


booking.address || "",


booking.service,


price,


0,


price,


booking.date,


booking.timeSlot,


"pending",


null,


new Date().toISOString()


);






sendBookingEmail({

name:booking.name,

email:booking.email,

service:booking.service,

date:booking.date,

timeSlot:booking.timeSlot,

price:price,

deposit:0,

remaining:price

});





res.json({

success:true,

bookingId:
result.lastInsertRowid

});




}


catch(error){


console.log(

"PAY LATER ERROR:",

error

);



res.status(500).json({

error:"Server error"

});


}



});
// ================= STRIPE 25% DEPOSIT CHECKOUT =================


app.post(

"/api/create-deposit-checkout",

async(req,res)=>{


try{


const booking =
req.body;



if(

!booking.name ||

!booking.email ||

!booking.price

){


return res.status(400).json({

error:"Missing booking information"

});


}





// CHECK TIME SLOT


const existing =

db.prepare(`

SELECT id

FROM bookings

WHERE date=?

AND timeSlot=?

`)

.get(

booking.date,

booking.timeSlot

);





if(existing){


return res.status(400).json({

error:"Time slot already booked"

});


}





const total =
Number(booking.price);



const deposit =
total * 0.25;



const remaining =
total - deposit;







// CREATE STRIPE SESSION


const session =

await stripe.checkout.sessions.create({


payment_method_types:[

"card"

],


mode:"payment",



customer_email:

booking.email,



line_items:[

{


price_data:{


currency:"usd",



product_data:{


name:

booking.service


},


unit_amount:

Math.round(

deposit * 100

)


},



quantity:1


}

],



success_url:

`${FRONTEND_URL}/success.html`,



cancel_url:

`${FRONTEND_URL}/booking.html`



});








// SAVE BOOKING


const result =

db.prepare(`

INSERT INTO bookings

(

name,

email,

phone,

address,

service,

price,

deposit,

remaining,

date,

timeSlot,

status,

stripeSession,

createdAt

)

VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)

`)

.run(


booking.name,


booking.email,


booking.phone || "",


booking.address || "",


booking.service,


total,


deposit,


remaining,


booking.date,


booking.timeSlot,


"deposit-paid",


session.id,


new Date().toISOString()


);








sendBookingEmail({

name:booking.name,

email:booking.email,

service:booking.service,

date:booking.date,

timeSlot:booking.timeSlot,

price:total,

deposit:deposit,

remaining:remaining

});







res.json({

success:true,

url:session.url,

bookingId:
result.lastInsertRowid

});





}

catch(error){


console.log(

"STRIPE ERROR:",

error

);



res.status(500).json({

error:"Payment error"

});


}



});









// ================= CREATE CONTRACT PDF =================


function createContractPDF(contract){


return new Promise((resolve,reject)=>{


try{


const folder =
path.join(
__dirname,
"contracts"
);



if(!fs.existsSync(folder)){

fs.mkdirSync(folder);

}




const filename =

"contract_" +

Date.now() +

".pdf";



const filepath =

path.join(

folder,

filename

);




const doc =

new PDFDocument({

size:"LETTER",

margin:60

});




const stream =

fs.createWriteStream(filepath);



doc.pipe(stream);





doc.fontSize(20)

.text(

"My DMV Cleaning Services LLC",

{

align:"center"

}

);



doc.moveDown();



doc.fontSize(15)

.text(

"Cleaning Service Agreement",

{

align:"center"

}

);



doc.moveDown(2);



doc.fontSize(12)

.text(

"Customer Information"

);



doc.moveDown();



doc.text(

"Name: " + contract.name

);



doc.text(

"Email: " + contract.email

);



doc.text(

"Phone: " + (contract.phone || "")

);



doc.moveDown();



doc.text(

"Agreement Type: " +

(contract.contractType || "Service Agreement")

);





doc.moveDown(2);



doc.text(

"Customer Signature:"

);



doc.moveDown();




if(contract.signature){


const base64 =

contract.signature.replace(

"data:image/png;base64,",

""

);



const signatureFile =

path.join(

folder,

"signature_" +

Date.now() +

".png"

);



fs.writeFileSync(

signatureFile,

base64,

"base64"

);



doc.image(

signatureFile,

{

width:160

}

);


doc.moveDown();


}





doc.text(

"Signed Name: " +

contract.typedName

);



doc.text(

"Date Signed: " +

new Date().toLocaleDateString()

);



doc.end();





stream.on(

"finish",

()=>{


resolve(

"/contracts/" + filename

);


}

);





stream.on(

"error",

reject

);



}

catch(error){


reject(error);


}



});


}










// ================= SIGN CONTRACT =================


app.post(

"/api/sign-contract",

async(req,res)=>{


try{


const contract =
req.body;



if(

!contract.name ||

!contract.email ||

!contract.typedName

){


return res.status(400).json({

success:false,

error:"Missing required fields"

});


}





const pdfUrl =

await createContractPDF(contract);





db.prepare(`

INSERT INTO contracts

(

name,

email,

phone,

contractType,

typedName,

pdfUrl,

createdAt

)

VALUES(?,?,?,?,?,?,?)

`)

.run(


contract.name,


contract.email,


contract.phone || "",


contract.contractType || "Contract",


contract.typedName,


pdfUrl,


new Date().toISOString()


);






// SEND CONTRACT EMAIL


await transporter.sendMail({


from:

process.env.EMAIL_USER,


to:

process.env.EMAIL_USER,


subject:

"New Signed Contract - My DMV Cleaning Services LLC",



html:`


<h2>
New Contract Signed
</h2>


<p>
Name: ${contract.name}
</p>


<p>
Email: ${contract.email}
</p>


<p>
Signed Name: ${contract.typedName}
</p>


<p>
PDF:
${pdfUrl}
</p>


`


});





res.json({

success:true,

pdf:pdfUrl

});




}


catch(error){


console.log(

"CONTRACT ERROR:",

error

);



res.status(500).json({

success:false,

error:"Server contract error"

});


}



});
// ================= ADMIN LOGIN =================


app.post(

"/api/admin/login",

(req,res)=>{


const {

username,

password

}=req.body;




if(

username === ADMIN_USER &&

password === ADMIN_PASS

){



const token =

jwt.sign(

{

role:"admin"

},

SECRET,

{

expiresIn:"2h"

}

);





return res.json({

success:true,

token

});



}



res.status(401).json({

success:false,

error:"Invalid username or password"

});



});








// ================= ADMIN BOOKINGS =================


app.get(

"/api/admin/bookings",

verifyAdmin,

(req,res)=>{


try{


const rows =

db.prepare(`

SELECT *

FROM bookings

ORDER BY id DESC

`)

.all();




res.json(rows);



}

catch(error){


console.log(

"ADMIN BOOKINGS ERROR:",

error

);



res.status(500).json([]);

}


});









// ================= UPDATE BOOKING STATUS =================


app.put(

"/api/admin/bookings/:id",

verifyAdmin,

(req,res)=>{


try{


const {

status

}=req.body;




db.prepare(`

UPDATE bookings

SET status=?

WHERE id=?

`)

.run(

status,

req.params.id

);





res.json({

success:true

});



}

catch(error){


console.log(error);



res.status(500).json({

success:false

});



}


});









// ================= DELETE BOOKING =================


app.delete(

"/api/admin/bookings/:id",

verifyAdmin,

(req,res)=>{


try{


db.prepare(`

DELETE FROM bookings

WHERE id=?

`)

.run(

req.params.id

);





res.json({

success:true

});



}

catch(error){


console.log(error);



res.status(500).json({

success:false

});


}



});









// ================= ADMIN CONTRACTS =================


app.get(

"/api/admin/contracts",

verifyAdmin,

(req,res)=>{


try{


const rows =

db.prepare(`

SELECT *

FROM contracts

ORDER BY id DESC

`)

.all();




res.json(rows);



}

catch(error){


console.log(error);



res.status(500).json([]);

}


});









// ================= DELETE CONTRACT =================


app.delete(

"/api/admin/contracts/:id",

verifyAdmin,

(req,res)=>{


try{


db.prepare(`

DELETE FROM contracts

WHERE id=?

`)

.run(

req.params.id

);





res.json({

success:true

});



}

catch(error){


console.log(error);



res.status(500).json({

success:false

});


}


});









// ================= GET SINGLE BOOKING =================


app.get(

"/api/booking/:id",

(req,res)=>{


try{


const booking =

db.prepare(`

SELECT *

FROM bookings

WHERE id=?

`)

.get(

req.params.id

);




if(!booking){


return res.status(404).json({

error:"Booking not found"

});


}





res.json(booking);



}

catch(error){


console.log(

"GET BOOKING ERROR:",

error

);



res.status(500).json({

error:"Server error"

});


}



});









// ================= STATIC FILES =================


// CONTRACT PDF FILES

app.use(

"/contracts",

express.static(

path.join(

__dirname,

"contracts"

)

)

);





// INVOICES

app.use(

"/invoices",

express.static(

path.join(

__dirname,

"invoices"

)

)

);





// FRONTEND (IONOS / LOCAL)

app.use(

express.static(

path.join(

__dirname,

"public"

)

)

);









// ================= 404 =================


app.use(

(req,res)=>{


res.status(404).json({

error:"Route not found"

});


}

);









// ================= START SERVER =================


app.listen(

PORT,

()=>{


console.log(
"================================="
);


console.log(

"🚀 Server running on port " + PORT

);


console.log(
"================================="
);



}

);