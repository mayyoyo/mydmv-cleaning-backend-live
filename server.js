// ================= IMPORTS =================

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");

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
process.env.JWT_SECRET || 
"supersecretkey123";


const FRONTEND_URL =
process.env.FRONTEND_URL ||
"https://mydmvcleaningservice.com";



// ================= STRIPE =================

const stripe =
Stripe(
    process.env.STRIPE_SECRET_KEY
);

console.log("✅ Stripe loaded");



// ================= EMAIL SYSTEM =================


const transporter =
nodemailer.createTransport({

    service:"gmail",

    auth:{
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
    }

});


console.log("✅ Gmail email system loaded");



// ================= ADMIN =================


const ADMIN_USER =
"admin";


const ADMIN_PASS =
"123456";



// ================= DATABASE =================


const db =
new Database(
    path.join(
        __dirname,
        "database.db"
    )
);


console.log("✅ SQLite connected");



// ================= CREATE FOLDERS =================


const folders = [

"contracts",

"invoices"

];


folders.forEach(folder=>{

const dir =
path.join(
    __dirname,
    folder
);


if(!fs.existsSync(dir)){

    fs.mkdirSync(dir);

    console.log(
        "Created folder:",
        folder
    );

}

});



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



// ================= SEND EMAIL FUNCTION =================


async function sendEmail({
to,
subject,
html
}){


try{


await transporter.sendMail({

from:
process.env.EMAIL_USER,


to,


subject,


html

});


console.log(
"✅ EMAIL SENT:",
subject
);


}


catch(error){


console.log(
"❌ EMAIL ERROR:",
error.message
);


}


}



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



console.log(
"📩 Incoming contact:",
req.body
);



// SAVE CONTACT

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

`)

.run(

name,

email,

phone || "",

message,

new Date().toISOString()

);





// SEND EMAIL


await sendEmail({

to:
process.env.EMAIL_USER,


subject:
"New Contact Message - My DMV Cleaning Services LLC",


html:

`

<h2>New Contact Request</h2>

<p><b>Name:</b> ${name}</p>

<p><b>Email:</b> ${email}</p>

<p><b>Phone:</b> ${phone}</p>

<p><b>Message:</b></p>

<p>${message}</p>

`

});




res.json({

success:true,

message:"Email sent"

});



}


catch(error){


console.log(
"❌ CONTACT ERROR:",
error
);



res.status(500).json({

success:false,

error:error.message

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





// ================= BOOKING EMAIL =================



async function sendBookingEmail(booking){


await sendEmail({

to:

booking.email,


subject:

"Booking Confirmation - My DMV Cleaning Services LLC",



html:

`

<h2>Booking Confirmation</h2>


<p>Thank you ${booking.name}</p>


<p>Your cleaning appointment has been received.</p>


<hr>


<p><b>Service:</b> ${booking.service}</p>


<p><b>Date:</b> ${booking.date}</p>


<p><b>Time:</b> ${booking.timeSlot}</p>


<p><b>Total:</b> $${booking.price}</p>


<p><b>Deposit:</b> $${booking.deposit}</p>


<p><b>Remaining:</b> $${booking.remaining}</p>



<p>
My DMV Cleaning Services LLC
</p>

`

});


}







// ================= PAY LATER BOOKING =================





app.post(
"/api/book-pay-later",

async(req,res)=>{


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




const price =
Number(
booking.price
);



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






await sendBookingEmail({

name:booking.name,

email:booking.email,

service:booking.service,

date:booking.date,

timeSlot:booking.timeSlot,

price,

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








// ================= STRIPE DEPOSIT CHECKOUT =================



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





const total =
Number(
booking.price
);



const deposit =
total * 0.25;



const remaining =
total - deposit;






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






await sendBookingEmail({

name:booking.name,

email:booking.email,

service:booking.service,

date:booking.date,

timeSlot:booking.timeSlot,

price:total,

deposit,

remaining

});






res.json({

success:true,

url:
session.url

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




const filename =

"contract_" + Date.now() + ".pdf";



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

"Phone: " + 

(contract.phone || "")

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






// SAVE SIGNATURE IMAGE IF PROVIDED


if(contract.signature){



const base64 =

contract.signature.replace(

"data:image/png;base64,",

""

);




const signatureFile =

path.join(

folder,

"signature_" + Date.now() + ".png"

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



}

);






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



}

);








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


console.log(

"UPDATE ERROR:",

error

);



res.status(500).json({

success:false

});



}



}

);







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


console.log(

"DELETE BOOKING ERROR:",

error

);



res.status(500).json({

success:false

});



}



}

);








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



console.log(

"ADMIN CONTRACT ERROR:",

error

);



res.status(500).json([]);

}



}

);








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



console.log(

"DELETE CONTRACT ERROR:",

error

);



res.status(500).json({

success:false

});



}



}

);









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



}

);
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





// FRONTEND PUBLIC FOLDER

app.use(

express.static(

path.join(

__dirname,

"public"

)

)

);






// ================= ROOT TEST =================



app.get(

"/api/test",

(req,res)=>{


res.json({

message:"Backend working",

time:new Date()

});


}

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

"🌐 Frontend:",

FRONTEND_URL

);


console.log(

"================================="

);


}

);