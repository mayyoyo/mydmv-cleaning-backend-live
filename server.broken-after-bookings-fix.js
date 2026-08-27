// ============================================================
// My DMV Cleaning Services LLC
// PRODUCTION SERVER
// ============================================================


// ================= IMPORTS =================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");


// ================= ENV =================

dotenv.config();


// ================= APP =================

const app = express();


// ================= MIDDLEWARE =================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended:true
}));


// ================= CREATE FOLDERS =================

const folders = [

    "public/signed-contracts",
    "public/invoices",
    "public/uploads",
    "public/uploads/signatures"

];


folders.forEach(folder=>{

    const folderPath = path.join(__dirname, folder);


    if(!fs.existsSync(folderPath)){

        fs.mkdirSync(folderPath,{
            recursive:true
        });

        console.log(
            "Created:",
            folder
        );

    }

});


// ================= STATIC WEBSITE =================

app.use(
    express.static(
        path.join(__dirname,"public")
    )
);


// ================= PORT =================

const PORT =
process.env.PORT || 5000;



// ================= STRIPE =================

const stripe = Stripe(
    process.env.STRIPE_SECRET_KEY
);



// ================= DATABASE =================

const db = new Database(
    path.join(
        __dirname,
        "bookings.db"
    )
);


// ================= BOOKINGS TABLE =================


db.prepare(`

CREATE TABLE IF NOT EXISTS bookings (

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT NOT NULL,

email TEXT NOT NULL,

phone TEXT,

address TEXT,

service TEXT,

price REAL,

deposit REAL,

remaining REAL,

date TEXT,

timeSlot TEXT,

paymentType TEXT,

stripeSession TEXT,

status TEXT DEFAULT 'pending',

createdAt DATETIME DEFAULT CURRENT_TIMESTAMP

)

`).run();




// ================= CONTACTS TABLE =================


db.prepare(`

CREATE TABLE IF NOT EXISTS contacts (

id INTEGER PRIMARY KEY AUTOINCREMENT,

name TEXT,

email TEXT,

phone TEXT,

message TEXT,

status TEXT DEFAULT 'new',

createdAt DATETIME DEFAULT CURRENT_TIMESTAMP

)

`).run();









// ================= CONTRACTS TABLE =================

db.prepare(`

CREATE TABLE IF NOT EXISTS contracts (

id INTEGER PRIMARY KEY AUTOINCREMENT,

bookingId INTEGER,

name TEXT,

email TEXT,

file TEXT,

createdAt DATETIME DEFAULT CURRENT_TIMESTAMP

)

`).run();


// ============================================================
// UPDATE EXISTING CONTRACTS TABLE
// ============================================================

try {

    const columns =
        db.prepare(`
            PRAGMA table_info(contracts)
        `).all();


    const hasBookingId =
        columns.some(
            column =>
                column.name === "bookingId"
        );


    if (!hasBookingId) {

        db.prepare(`
            ALTER TABLE contracts
            ADD COLUMN bookingId INTEGER
        `).run();


        console.log(
            "Added bookingId column to contracts table"
        );

    }

// ============================================================
// ADMIN LOAD BOOKINGS
// ============================================================

app.get("/api/admin/bookings", verifyAdmin, (req,res)=>{
    try {
        const bookings = db.prepare("SELECT id,name,email,phone,address,service,price,deposit,remaining,date,timeSlot,paymentType,stripeSession,status,createdAt FROM bookings ORDER BY id DESC").all();
        res.json({success:true,bookings:bookings});
    } catch(error) {
        console.error("ADMIN BOOKINGS ERROR:",error);
        res.status(500).json({success:false,message:"Could not load bookings",error:error.message});
    }
});

// ============================================================
// UPDATE BOOKING STATUS
// ============================================================


app.put(
"/api/admin/bookings/:id/status",
verifyAdmin,
(req,res)=>{


try{


db.prepare(`

UPDATE bookings

SET status = ?

WHERE id = ?

`).run(

req.body.status,

req.params.id

);



res.json({

success:true,

message:
"Status updated"

});



}catch(error){


res.status(500).json({

success:false

});


}



});







// ============================================================
// CANCEL BOOKING
// ============================================================


app.put(
"/api/admin/bookings/:id/cancel",
verifyAdmin,
(req,res)=>{


try{


db.prepare(`

UPDATE bookings

SET status='cancelled'

WHERE id=?

`).run(

req.params.id

);



res.json({

success:true

});


}catch(error){


res.status(500).json({

success:false

});


}



});







// ============================================================
// DELETE BOOKING
// ============================================================


app.delete(
"/api/admin/bookings/:id",
verifyAdmin,
(req,res)=>{


try{


db.prepare(`

DELETE FROM bookings

WHERE id=?

`).run(

req.params.id

);



res.json({

success:true

});



}catch(error){


res.status(500).json({

success:false

});


}



});





// ============================================================
// HOME PAGE
// ============================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


// ============================================================
// ADMIN INVOICE PDF
// ============================================================

app.get(
    "/api/admin/invoice/:id",
    (req, res) => {

        try {

            const booking =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    WHERE id = ?
                `).get(
                    req.params.id
                );


            if (!booking) {

                return res.status(404).json({

                    success: false,

                    message: "Booking not found"

                });

            }


            console.log(
                "Generating invoice for booking:",
                booking.id
            );


            const doc =
                new PDFDocument();


            res.setHeader(
                "Content-Type",
                "application/pdf"
            );


            res.setHeader(
                "Content-Disposition",
                `inline; filename=invoice-${booking.id}.pdf`
            );


            doc.pipe(res);


            doc
                .fontSize(20)
                .text(
                    "My DMV Cleaning Services LLC",
                    {
                        align: "center"
                    }
                );


            doc.moveDown();


            doc
                .fontSize(16)
                .text(
                    `Invoice #${booking.id}`
                );


            doc.moveDown();


            doc
                .fontSize(11)
                .text(
                    `Name: ${booking.name || ""}`
                );


            doc.text(
                `Email: ${booking.email || ""}`
            );


            doc.text(
                `Phone: ${booking.phone || ""}`
            );


            doc.text(
                `Address: ${booking.address || ""}`
            );


            doc.moveDown();


            doc.text(
                `Service: ${booking.service || ""}`
            );


            doc.text(
                `Date: ${booking.date || ""}`
            );


            doc.text(
                `Time: ${booking.timeSlot || ""}`
            );


            doc.moveDown();


            doc.text(
                `Total Price: $${Number(
                    booking.price || 0
                ).toFixed(2)}`
            );


            doc.text(
                `Deposit Paid: $${Number(
                    booking.deposit || 0
                ).toFixed(2)}`
            );


            doc.text(
                `Remaining: $${Number(
                    booking.remaining || 0
                ).toFixed(2)}`
            );


            doc.moveDown();


            doc.text(
                `Payment Type: ${booking.paymentType || ""}`
            );


            doc.text(
                `Status: ${booking.status || ""}`
            );


            doc.moveDown();


            doc.text(
                "Thank you for choosing My DMV Cleaning Services LLC!",
                {
                    align: "center"
                }
            );


            doc.end();


        } catch (error) {

            console.error(
                "INVOICE PDF ERROR:",
                error
            );


            if (!res.headersSent) {

                res.status(500).json({

                    success: false,

                    message:
                        "Failed to generate invoice"

                });

            }

        }

    }
);
// 
// ============================================================
// CREATE SIGNED CONTRACT PDF
// ============================================================

app.post(
    "/api/contracts",
    async (req, res) => {

        try {

            // ====================================================
            // GET DATA FROM CONTRACT FORM
            // ====================================================

            const {
                name,
                businessName,
                email,
                phone,
                contractType,
                experience,
                services,
                availability,
                license,
                insurance,
                address,
                serviceDescription,
                jobDescription,
                completionNotes,
                typedName,
                signature
            } = req.body;


            // ====================================================
            // REQUIRED FIELDS
            // ====================================================

            if (
                !name ||
                !email ||
                !typedName ||
                !signature
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name, email, typed signature, and drawn signature are required."

                });

            }


            // ====================================================
            // MAKE SAFE FILE NAME
            // ====================================================

            const safeName =
                name
                    .replace(
                        /[^a-z0-9]/gi,
                        "-"
                    )
                    .toLowerCase();


            const timestamp =
                Date.now();


            const fileName =
                `contract-${safeName}-${timestamp}.pdf`;


            const filePath =
                path.join(
                    contractsFolder,
                    fileName
                );


            // ====================================================
            // CREATE PDF
            // ====================================================

            const doc =
                new PDFDocument({
                    margin: 50
                });


            const writeStream =
                fs.createWriteStream(
                    filePath
                );


            doc.pipe(
                writeStream
            );


            // ====================================================
            // PDF HEADER
            // ====================================================

            doc
                .fontSize(20)
                .font("Helvetica-Bold")
                .text(
                    "My DMV Cleaning Services LLC",
                    {
                        align: "center"
                    }
                );


            doc.moveDown();


            doc
                .fontSize(16)
                .text(
                    contractType ||
                    "Signed Document",
                    {
                        align: "center"
                    }
                );


            doc.moveDown();


            doc
                .fontSize(10)
                .font("Helvetica")
                .text(
                    `Document Date: ${new Date().toLocaleString()}`
                );


            doc.moveDown();


            // ====================================================
            // CUSTOMER INFORMATION
            // ====================================================

            doc
                .fontSize(13)
                .font("Helvetica-Bold")
                .text(
                    "Customer Information"
                );


            doc.moveDown(0.5);


            doc
                .fontSize(11)
                .font("Helvetica")
                .text(
                    `Full Name: ${name || ""}`
                );


            doc.text(
                `Business Name: ${businessName || ""}`
            );


            doc.text(
                `Email: ${email || ""}`
            );


            doc.text(
                `Phone: ${phone || ""}`
            );


            doc.moveDown();


            // ====================================================
            // CONTRACT TYPE
            // ====================================================

            doc
                .fontSize(13)
                .font("Helvetica-Bold")
                .text(
                    "Document Information"
                );


            doc.moveDown(0.5);


            doc
                .fontSize(11)
                .font("Helvetica")
                .text(
                    `Contract Type: ${contractType || ""}`
                );


            doc.moveDown();


            // ====================================================
            // CONTRACTOR INFORMATION
            // ====================================================

            if (
                contractType ===
                "Independent Contractor Agreement"
            ) {

                doc
                    .fontSize(13)
                    .font("Helvetica-Bold")
                    .text(
                        "Independent Contractor Information"
                    );


                doc.moveDown(0.5);


                doc
                    .fontSize(11)
                    .font("Helvetica")
                    .text(
                        `Experience: ${experience || ""}`
                    );


                doc.text(
                    `Services: ${
                        Array.isArray(services)
                            ? services.join(", ")
                            : services || ""
                    }`
                );


                doc.text(
                    `Availability: ${availability || ""}`
                );


                doc.text(
                    `License / Certification: ${license || ""}`
                );


                doc.text(
                    `Insurance: ${insurance || ""}`
                );


                doc.moveDown();

            }


            // ====================================================
            // CLIENT SERVICE INFORMATION
            // ====================================================

            if (
                contractType ===
                "Client Service Agreement"
            ) {

                doc
                    .fontSize(13)
                    .font("Helvetica-Bold")
                    .text(
                        "Client Service Information"
                    );


                doc.moveDown(0.5);


                doc
                    .fontSize(11)
                    .font("Helvetica")
                    .text(
                        `Service Address: ${address || ""}`
                    );


                doc.moveDown(0.5);


                doc
                    .font("Helvetica-Bold")
                    .text(
                        "Requested Services:"
                    );


                doc
                    .font("Helvetica")
                    .text(
                        serviceDescription || ""
                    );


                doc.moveDown();

            }


            // ====================================================
            // JOB COMPLETION INFORMATION
            // ====================================================

            if (
                contractType ===
                "Job Completion Form"
            ) {

                doc
                    .fontSize(13)
                    .font("Helvetica-Bold")
                    .text(
                        "Job Completion Information"
                    );


                doc.moveDown(0.5);


                doc
                    .font("Helvetica-Bold")
                    .text(
                        "Work Completed:"
                    );


                doc
                    .font("Helvetica")
                    .text(
                        jobDescription || ""
                    );


                doc.moveDown(0.5);


                doc
                    .font("Helvetica-Bold")
                    .text(
                        "Completion Notes:"
                    );


                doc
                    .font("Helvetica")
                    .text(
                        completionNotes || ""
                    );


                doc.moveDown();

            }


            // ====================================================
            // SIGNATURE SECTION
            // ====================================================

            doc
                .fontSize(13)
                .font("Helvetica-Bold")
                .text(
                    "Signature"
                );


            doc.moveDown(0.5);


            doc
                .fontSize(11)
                .font("Helvetica")
                .text(
                    `Typed Signature: ${typedName}`
                );


            doc.moveDown();


            // ====================================================
            // ADD DRAWN SIGNATURE TO PDF
            // ====================================================

            if (
                signature &&
                signature.startsWith(
                    "data:image"
                )
            ) {

                try {

                    const base64Data =
                        signature
                            .replace(
                                /^data:image\/png;base64,/,
                                ""
                            );


                    const signatureBuffer =
                        Buffer.from(
                            base64Data,
                            "base64"
                        );


                    const signatureFile =
                        path.join(
                            contractsFolder,
                            `signature-${timestamp}.png`
                        );


                    fs.writeFileSync(
                        signatureFile,
                        signatureBuffer
                    );


                    doc
                        .fontSize(11)
                        .font("Helvetica-Bold")
                        .text(
                            "Drawn Signature:"
                        );


                    doc.moveDown(0.5);


                    doc.image(
                        signatureBuffer,
                        {
                            fit: [
                                300,
                                100
                            ]
                        }
                    );


                    doc.moveDown();


                    // Delete temporary signature image
                    try {

                        fs.unlinkSync(
                            signatureFile
                        );

                    } catch (deleteError) {

                        console.log(
                            "Signature cleanup warning:",
                            deleteError.message
                        );

                    }

                } catch (signatureError) {

                    console.log(
                        "Signature image error:",
                        signatureError.message
                    );

                }

            }


            // ====================================================
            // LEGAL NOTICE
            // ====================================================

            doc.moveDown();


            doc
                .fontSize(9)
                .font("Helvetica")
                .text(
                    "This document was electronically signed and submitted through My DMV Cleaning Services LLC."
                );


            doc.moveDown();


            doc.text(
                "The typed name and drawn signature above represent the signer's electronic signature."
            );


            // ====================================================
            // PDF FOOTER
            // ====================================================

            doc.moveDown(2);


            doc
                .fontSize(10)
                .font("Helvetica-Bold")
                .text(
                    "My DMV Cleaning Services LLC",
                    {
                        align: "center"
                    }
                );


            doc
                .fontSize(9)
                .font("Helvetica")
                .text(
                    "© 2026 My DMV Cleaning Services LLC. All rights reserved.",
                    {
                        align: "center"
                    }
                );


            // ====================================================
            // FINISH PDF
            // ====================================================

            doc.end();


            // ====================================================
            // WAIT FOR PDF TO FINISH WRITING
            // ====================================================

            await new Promise(
                (resolve, reject) => {

                    writeStream.on(
                        "finish",
                        resolve
                    );


                    writeStream.on(
                        "error",
                        reject
                    );

                }
            );


            // ====================================================
            // SAVE CONTRACT IN DATABASE
            // ====================================================

            const fileUrl =
                `/contracts/${fileName}`;


            const result =
                db.prepare(`
                    INSERT INTO contracts
                    (
                        bookingId,
                        name,
                        email,
                        pdfUrl
                    )
                    VALUES (?, ?, ?, ?)
                `).run(

                    null,

                    name,

                    email,

                    fileUrl

                );


            // ====================================================
            // SUCCESS RESPONSE
            // ====================================================

            console.log(
                "Contract PDF created:",
                fileUrl
            );


            res.json({

                success: true,

                contractId:
                    result.lastInsertRowid,

                file:
                    fileUrl,

                message:
                    "Signed contract PDF created successfully."

            });


        } catch (error) {

            console.error(
                "CONTRACT PDF ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to create signed contract PDF."

            });

        }

    }
);
// ============================================================
// ADMIN GET CONTRACTS
// ============================================================

app.get(
    "/api/admin/contracts",
    verifyAdmin,
    (req, res) => {

        try {

            const contracts = db.prepare(`
                SELECT *
                FROM contracts
                ORDER BY id DESC
            `).all();

            res.json({
                success: true,
                contracts
            });

        } catch (error) {

            console.log(
                "GET CONTRACTS ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Could not load contracts"
            });

        }

    }
);
// 

// ============================================================
// ADMIN DELETE CONTRACT PDF
// ============================================================

app.delete(
    "/api/admin/contracts/:id",
    verifyAdmin,
    (req, res) => {

        try {

            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid contract ID"
                });

            }

            const contract = db.prepare(
                "SELECT * FROM contracts WHERE id = ?"
            ).get(id);

            if (!contract) {

                return res.status(404).json({
                    success: false,
                    message: "Contract not found"
                });

            }

            const file = contract.file || "";

            if (file) {

                const fileName =
                    file
                        .replace(/^https?:\/\/[^/]+\//, "")
                        .replace(/^\/+/, "");

                const filePath =
                    path.join(
                        __dirname,
                        "public",
                        fileName
                    );

                if (fs.existsSync(filePath)) {

                    fs.unlinkSync(filePath);

                    console.log(
                        "Contract PDF deleted:",
                        filePath
                    );

                }

            }

            db.prepare(
                "DELETE FROM contracts WHERE id = ?"
            ).run(id);

            res.json({
                success: true,
                message: "Contract PDF deleted successfully"
            });

        } catch (error) {

            console.error(
                "DELETE CONTRACT ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Could not delete contract PDF"
            });

        }

    }
);

// ============================================================
// FINAL ERROR HANDLER
// THIS MUST BE THE LAST app.use()
// ============================================================

app.use(
    (req, res) => {

        console.log(
            "404 ROUTE:",
            req.method,
            req.originalUrl
        );


        res.status(404).json({

            success: false,

            error: "Route not found",

            path: req.originalUrl

        });

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `My DMV Cleaning Services running on port ${PORT}`
        );

    }
);