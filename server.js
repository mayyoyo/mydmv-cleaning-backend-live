// ============================================================
// My DMV Cleaning Services LLC
// PRODUCTION SERVER
// ============================================================

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


// ============================================================
// APP
// ============================================================

const app = express();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
    cors({
        origin: true,
        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);


// ============================================================
// CONFIGURATION
// ============================================================

const PORT =
    process.env.PORT || 5000;

const SECRET =
    process.env.JWT_SECRET ||
    "supersecretkey123";

const BACKEND_URL =
    process.env.BACKEND_URL ||
    "https://mydmv-cleaning-backend-live.onrender.com";

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://mydmvcleaningservice.com";

console.log("=================================");
console.log("🌐 FRONTEND:", FRONTEND_URL);
console.log("🔗 BACKEND:", BACKEND_URL);
console.log("=================================");


// ============================================================
// STRIPE
// ============================================================

let stripe = null;

if (!process.env.STRIPE_SECRET_KEY) {

    console.error(
        "❌ STRIPE_SECRET_KEY is missing from Render environment variables."
    );

} else {

    try {

        stripe = Stripe(
            process.env.STRIPE_SECRET_KEY
        );

        console.log(
            "✅ Stripe initialized"
        );

    } catch (error) {

        console.error(
            "❌ Stripe initialization error:",
            error
        );

    }

}


// ============================================================
// EMAIL
// ============================================================

if (!process.env.EMAIL_USER) {

    console.error(
        "❌ EMAIL_USER is missing!"
    );

}

if (!process.env.EMAIL_PASS) {

    console.error(
        "❌ EMAIL_PASS is missing!"
    );

}

const transporter =
    nodemailer.createTransport({

        service: "gmail",

        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }

    });


transporter.verify(
    (error) => {

        if (error) {

            console.error(
                "❌ GMAIL SMTP ERROR:"
            );

            console.error(
                error
            );

        } else {

            console.log(
                "✅ Gmail SMTP connection ready"
            );

        }

    }
);


// ============================================================
// ADMIN
// ============================================================

const ADMIN_USER =
    process.env.ADMIN_USER ||
    "admin";

const ADMIN_PASS =
    process.env.ADMIN_PASS ||
    "123456";


// ============================================================
// DATABASE
// ============================================================

const db =
    new Database(
        path.join(
            __dirname,
            "database.db"
        )
    );

console.log(
    "✅ SQLite connected"
);


// ============================================================
// SQLITE SETTINGS
// ============================================================

db.pragma(
    "journal_mode = WAL"
);


// ============================================================
// CREATE DIRECTORIES
// ============================================================

const folders = [
    "contracts",
    "invoices"
];

folders.forEach(
    (folder) => {

        const directory =
            path.join(
                __dirname,
                folder
            );

        if (
            !fs.existsSync(
                directory
            )
        ) {

            fs.mkdirSync(
                directory,
                {
                    recursive: true
                }
            );

            console.log(
                "📁 Created folder:",
                folder
            );

        }

    }
);


// ============================================================
// CREATE DATABASE TABLES
// ============================================================

db.exec(`

CREATE TABLE IF NOT EXISTS bookings (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,

    email TEXT NOT NULL,

    phone TEXT DEFAULT '',

    address TEXT DEFAULT '',

    service TEXT NOT NULL,

    price REAL NOT NULL DEFAULT 0,

    deposit REAL NOT NULL DEFAULT 0,

    remaining REAL NOT NULL DEFAULT 0,

    date TEXT NOT NULL,

    timeSlot TEXT NOT NULL,

    status TEXT DEFAULT 'pending',

    stripeSession TEXT,

    createdAt TEXT

);


CREATE TABLE IF NOT EXISTS contracts (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT,

    email TEXT,

    phone TEXT,

    contractType TEXT,

    typedName TEXT,

    pdfUrl TEXT,

    createdAt TEXT

);


CREATE TABLE IF NOT EXISTS contacts (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT,

    email TEXT,

    phone TEXT,

    message TEXT,

    createdAt TEXT

);

`);


// ============================================================
// DATABASE MIGRATION
// ============================================================

function addColumnIfMissing(
    table,
    column,
    definition
) {

    try {

        const columns =
            db.prepare(
                `PRAGMA table_info(${table})`
            ).all();

        const exists =
            columns.some(
                (item) =>
                    item.name === column
            );

        if (!exists) {

            db.exec(
                `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
            );

            console.log(
                `✅ Added missing column ${table}.${column}`
            );

        }

    } catch (error) {

        console.error(
            `❌ Database migration error for ${table}.${column}:`,
            error
        );

    }

}


// Existing databases may have been created
// by an older version of server.js.

addColumnIfMissing(
    "bookings",
    "phone",
    "TEXT DEFAULT ''"
);

addColumnIfMissing(
    "bookings",
    "address",
    "TEXT DEFAULT ''"
);

addColumnIfMissing(
    "bookings",
    "price",
    "REAL DEFAULT 0"
);

addColumnIfMissing(
    "bookings",
    "deposit",
    "REAL DEFAULT 0"
);

addColumnIfMissing(
    "bookings",
    "remaining",
    "REAL DEFAULT 0"
);

addColumnIfMissing(
    "bookings",
    "timeSlot",
    "TEXT DEFAULT ''"
);

addColumnIfMissing(
    "bookings",
    "status",
    "TEXT DEFAULT 'pending'"
);

addColumnIfMissing(
    "bookings",
    "stripeSession",
    "TEXT"
);

addColumnIfMissing(
    "bookings",
    "createdAt",
    "TEXT"
);


console.log(
    "✅ Database ready"
);


// ============================================================
// SAFE STRING
// ============================================================

function safeString(value) {

    if (
        value === undefined ||
        value === null
    ) {

        return "";

    }

    return String(value).trim();

}


// ============================================================
// SAFE NUMBER
// ============================================================

function safeNumber(value) {

    const number =
        Number(value);

    if (
        !Number.isFinite(number)
    ) {

        return 0;

    }

    return number;

}


// ============================================================
// EMAIL FUNCTION
// ============================================================

async function sendEmail({
    to,
    subject,
    html
}) {

    const recipient =
        safeString(to);

    const emailSubject =
        safeString(subject);

    if (!recipient) {

        throw new Error(
            "Email recipient is missing"
        );

    }

    if (
        !process.env.EMAIL_USER ||
        !process.env.EMAIL_PASS
    ) {

        throw new Error(
            "EMAIL_USER or EMAIL_PASS is missing"
        );

    }

    try {

        console.log(
            "📧 SENDING EMAIL"
        );

        console.log(
            "To:",
            recipient
        );

        console.log(
            "Subject:",
            emailSubject
        );

        const info =
            await transporter.sendMail({

                from:
                    `"My DMV Cleaning Services LLC" <${process.env.EMAIL_USER}>`,

                to:
                    recipient,

                subject:
                    emailSubject,

                html:
                    html || ""

            });

        console.log(
            "✅ EMAIL SENT"
        );

        console.log(
            "Message ID:",
            info.messageId
        );

        console.log(
            "To:",
            recipient
        );

        return {
            success: true,
            messageId:
                info.messageId
        };

    } catch (error) {

        console.error(
            "================================="
        );

        console.error(
            "❌ EMAIL ERROR"
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Code:",
            error.code
        );

        console.error(
            "Command:",
            error.command
        );

        console.error(
            "Response:",
            error.response
        );

        console.error(
            "Response Code:",
            error.responseCode
        );

        console.error(
            "Full error:",
            error
        );

        console.error(
            "================================="
        );

        throw error;

    }

}


// ============================================================
// ADMIN AUTH
// ============================================================

function verifyAdmin(
    req,
    res,
    next
) {

    const authorization =
        safeString(
            req.headers.authorization
        );

    if (!authorization) {

        return res.status(401).json({

            error:
                "No authorization token"

        });

    }

    try {

        const parts =
            authorization.split(" ");

        const token =
            parts.length > 1
                ? parts[1]
                : "";

        if (!token) {

            return res.status(401).json({

                error:
                    "Invalid authorization token"

            });

        }

        jwt.verify(
            token,
            SECRET
        );

        next();

    } catch (error) {

        console.error(
            "❌ ADMIN AUTH ERROR:",
            error.message
        );

        return res.status(401).json({

            error:
                "Invalid token"

        });

    }

}


// ============================================================
// CONTACT
// ============================================================

app.post(
    "/api/contact",
    async (req, res) => {

        try {

            const name =
                safeString(
                    req.body.name
                );

            const email =
                safeString(
                    req.body.email
                );

            const phone =
                safeString(
                    req.body.phone
                );

            const message =
                safeString(
                    req.body.message
                );

            console.log(
                "📩 CONTACT REQUEST:",
                {
                    name,
                    email,
                    phone,
                    message
                }
            );

            if (!name) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Name is required"

                });

            }

            if (!email) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Email is required"

                });

            }

            if (!message) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Message is required"

                });

            }

            db.prepare(`

                INSERT INTO contacts

                (
                    name,
                    email,
                    phone,
                    message,
                    createdAt
                )

                VALUES (?, ?, ?, ?, ?)

            `).run(

                name,
                email,
                phone,
                message,
                new Date().toISOString()

            );

            let emailSent =
                false;

            try {

                await sendEmail({

                    to:
                        process.env.EMAIL_USER,

                    subject:
                        "New Contact Message - My DMV Cleaning Services LLC",

                    html: `

                        <h2>
                            New Contact Request
                        </h2>

                        <p>
                            <strong>Name:</strong>
                            ${name}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${email}
                        </p>

                        <p>
                            <strong>Phone:</strong>
                            ${phone || "Not provided"}
                        </p>

                        <p>
                            <strong>Message:</strong>
                        </p>

                        <p>
                            ${message}
                        </p>

                    `

                });

                emailSent =
                    true;

            } catch (emailError) {

                console.error(
                    "❌ CONTACT EMAIL FAILED:"
                );

                console.error(
                    emailError
                );

            }

            return res.json({

                success: true,

                emailSent,

                message:
                    emailSent
                        ? "Message sent successfully"
                        : "Message saved, but email could not be sent"

            });

        } catch (error) {

            console.error(
                "❌ CONTACT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// CHECK BOOKED TIMES
// ============================================================

app.get(
    "/api/bookings-by-date/:date",
    (req, res) => {

        try {

            const date =
                safeString(
                    req.params.date
                );

            if (!date) {

                return res.json([]);

            }

            const rows =
                db.prepare(`

                    SELECT timeSlot

                    FROM bookings

                    WHERE date = ?

                `).all(
                    date
                );

            return res.json(

                rows.map(
                    (row) =>
                        safeString(
                            row.timeSlot
                        )
                )

            );

        } catch (error) {

            console.error(
                "❌ BOOKING DATE ERROR:",
                error
            );

            return res.json([]);

        }

    }
);


// ============================================================
// GET BOOKING BY STRIPE SESSION
// ============================================================

app.get(
    "/api/booking-by-session/:sessionId",
    (req, res) => {

        try {

            const sessionId =
                safeString(
                    req.params.sessionId
                );

            if (!sessionId) {

                return res.status(400).json({

                    error:
                        "Stripe session ID is required"

                });

            }

            const booking =
                db.prepare(`

                    SELECT *

                    FROM bookings

                    WHERE stripeSession = ?

                    LIMIT 1

                `).get(
                    sessionId
                );

            if (!booking) {

                return res.status(404).json({

                    error:
                        "Booking not found"

                });

            }

            return res.json(
                booking
            );

        } catch (error) {

            console.error(
                "❌ GET BOOKING BY SESSION ERROR:"
            );

            console.error(
                error
            );

            return res.status(500).json({

                error:
                    "Server error"

            });

        }

    }
);


// ============================================================
// BOOKING EMAIL
// ============================================================

async function sendBookingEmail(
    booking
) {

    const name =
        safeString(
            booking.name
        );

    const email =
        safeString(
            booking.email
        );

    const phone =
        safeString(
            booking.phone
        );

    const address =
        safeString(
            booking.address
        );

    const service =
        safeString(
            booking.service
        );

    const date =
        safeString(
            booking.date
        );

    const timeSlot =
        safeString(
            booking.timeSlot
        );

    const price =
        safeNumber(
            booking.price
        );

    const deposit =
        safeNumber(
            booking.deposit
        );

    const remaining =
        safeNumber(
            booking.remaining
        );

    if (!email) {

        throw new Error(
            "Booking customer email is missing"
        );

    }

    return sendEmail({

        to:
            email,

        subject:
            "Booking Confirmation - My DMV Cleaning Services LLC",

        html: `

            <div
                style="
                    font-family:Arial,sans-serif;
                    max-width:650px;
                    margin:auto;
                "
            >

                <h2>
                    🧼 My DMV Cleaning Services LLC
                </h2>

                <h3>
                    Booking Confirmation
                </h3>

                <p>
                    Thank you,
                    <strong>${name}</strong>.
                </p>

                <p>
                    Your cleaning appointment has been successfully received.
                </p>

                <hr>

                <h3>
                    🧹 Appointment Details
                </h3>

                <p>
                    <strong>Service:</strong>
                    ${service}
                </p>

                <p>
                    <strong>Date:</strong>
                    ${date}
                </p>

                <p>
                    <strong>Time:</strong>
                    ${timeSlot}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${phone || "Not provided"}
                </p>

                <p>
                    <strong>Address:</strong>
                    ${address || "Not provided"}
                </p>

                <hr>

                <h3>
                    💳 Payment Details
                </h3>

                <p>
                    <strong>Total:</strong>
                    $${price.toFixed(2)}
                </p>

                <p>
                    <strong>Deposit:</strong>
                    $${deposit.toFixed(2)}
                </p>

                <p>
                    <strong>Remaining:</strong>
                    $${remaining.toFixed(2)}
                </p>

                <hr>

                <p>
                    My DMV Cleaning Services LLC
                </p>

                <p>
                    📞 703-967-0674
                </p>

            </div>

        `

    });

}


// ============================================================
// PAY LATER
// ============================================================

app.post(
    "/api/book-pay-later",
    async (req, res) => {

        try {

            const name =
                safeString(
                    req.body.name
                );

            const email =
                safeString(
                    req.body.email
                );

            const phone =
                safeString(
                    req.body.phone
                );

            const address =
                safeString(
                    req.body.address
                );

            const service =
                safeString(
                    req.body.service
                );

            const date =
                safeString(
                    req.body.date
                );

            const timeSlot =
                safeString(
                    req.body.timeSlot
                );

            const price =
                safeNumber(
                    req.body.price
                );

            console.log(
                "📅 PAY LATER:",
                {
                    name,
                    email,
                    phone,
                    address,
                    service,
                    date,
                    timeSlot,
                    price
                }
            );

            if (!name) {

                return res.status(400).json({
                    success: false,
                    error: "Name is required"
                });

            }

            if (!email) {

                return res.status(400).json({
                    success: false,
                    error: "Email is required"
                });

            }

            if (!service) {

                return res.status(400).json({
                    success: false,
                    error: "Service is required"
                });

            }

            if (!date) {

                return res.status(400).json({
                    success: false,
                    error: "Date is required"
                });

            }

            if (!timeSlot) {

                return res.status(400).json({
                    success: false,
                    error: "Time slot is required"
                });

            }

            if (price <= 0) {

                return res.status(400).json({
                    success: false,
                    error: "A valid price is required"
                });

            }

            const existing =
                db.prepare(`

                    SELECT id

                    FROM bookings

                    WHERE date = ?

                    AND timeSlot = ?

                    LIMIT 1

                `).get(
                    date,
                    timeSlot
                );

            if (existing) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Time slot already booked"

                });

            }

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

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                `).run(

                    name,
                    email,
                    phone,
                    address,
                    service,
                    price,
                    0,
                    price,
                    date,
                    timeSlot,
                    "pending",
                    null,
                    new Date().toISOString()

                );

            const bookingId =
                Number(
                    result.lastInsertRowid
                );

            let emailSent =
                false;

            try {

                await sendBookingEmail({

                    name,
                    email,
                    phone,
                    address,
                    service,
                    date,
                    timeSlot,
                    price,
                    deposit: 0,
                    remaining: price

                });

                emailSent =
                    true;

            } catch (emailError) {

                console.error(
                    "❌ PAY LATER EMAIL FAILED:"
                );

                console.error(
                    emailError
                );

            }

            const redirectUrl =
                `${FRONTEND_URL}/success.html?booking_id=${encodeURIComponent(bookingId)}`;

            return res.json({

                success: true,

                bookingId,

                emailSent,

                redirectUrl,

                message:
                    "Booking created successfully"

            });

        } catch (error) {

            console.error(
                "❌ PAY LATER ERROR:"
            );

            console.error(
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// STRIPE DEPOSIT CHECKOUT
// ============================================================

app.post(
    "/api/create-deposit-checkout",
    async (req, res) => {

        try {

            if (!stripe) {

                return res.status(500).json({

                    success: false,

                    error:
                        "Stripe is not configured on the server"

                });

            }

            const name =
                safeString(
                    req.body.name
                );

            const email =
                safeString(
                    req.body.email
                );

            const phone =
                safeString(
                    req.body.phone
                );

            const address =
                safeString(
                    req.body.address
                );

            const service =
                safeString(
                    req.body.service
                );

            const date =
                safeString(
                    req.body.date
                );

            const timeSlot =
                safeString(
                    req.body.timeSlot
                );

            const total =
                safeNumber(
                    req.body.price
                );

            console.log(
                "💳 PAY NOW:",
                {
                    name,
                    email,
                    phone,
                    address,
                    service,
                    date,
                    timeSlot,
                    total
                }
            );

            if (!name) {

                return res.status(400).json({
                    success: false,
                    error: "Name is required"
                });

            }

            if (!email) {

                return res.status(400).json({
                    success: false,
                    error: "Email is required"
                });

            }

            if (!service) {

                return res.status(400).json({
                    success: false,
                    error: "Service is required"
                });

            }

            if (!date) {

                return res.status(400).json({
                    success: false,
                    error: "Date is required"
                });

            }

            if (!timeSlot) {

                return res.status(400).json({
                    success: false,
                    error: "Time slot is required"
                });

            }

            if (total <= 0) {

                return res.status(400).json({
                    success: false,
                    error: "A valid price is required"
                });

            }

            const existing =
                db.prepare(`

                    SELECT id

                    FROM bookings

                    WHERE date = ?

                    AND timeSlot = ?

                    LIMIT 1

                `).get(
                    date,
                    timeSlot
                );

            if (existing) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Time slot already booked"

                });

            }

            const deposit =
                Math.round(
                    total * 0.25 * 100
                ) / 100;

            const remaining =
                Math.round(
                    (total - deposit) * 100
                ) / 100;

            console.log(
                "💰 Payment:",
                {
                    total,
                    deposit,
                    remaining
                }
            );

            const session =
                await stripe.checkout.sessions.create({

                    payment_method_types: [
                        "card"
                    ],

                    mode:
                        "payment",

                    customer_email:
                        email,

                    metadata: {

                        name,
                        email,
                        phone,
                        address,
                        service,
                        date,
                        timeSlot,
                        total:
                            String(total)

                    },

                    line_items: [

                        {

                            price_data: {

                                currency:
                                    "usd",

                                product_data: {

                                    name:
                                        `${service} - 25% Deposit`

                                },

                                unit_amount:
                                    Math.round(
                                        deposit * 100
                                    )

                            },

                            quantity: 1

                        }

                    ],

                    success_url:
                        `${FRONTEND_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,

                    cancel_url:
                        `${FRONTEND_URL}/booking.html`

                });

            console.log(
                "✅ Stripe session created:",
                session.id
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

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                `).run(

                    name,
                    email,
                    phone,
                    address,
                    service,
                    total,
                    deposit,
                    remaining,
                    date,
                    timeSlot,
                    "deposit-paid",
                    session.id,
                    new Date().toISOString()

                );

            const bookingId =
                Number(
                    result.lastInsertRowid
                );

            let emailSent =
                false;

            try {

                await sendBookingEmail({

                    name,
                    email,
                    phone,
                    address,
                    service,
                    date,
                    timeSlot,
                    price: total,
                    deposit,
                    remaining

                });

                emailSent =
                    true;

            } catch (emailError) {

                console.error(
                    "❌ STRIPE BOOKING EMAIL FAILED:"
                );

                console.error(
                    emailError
                );

            }

            return res.json({

                success: true,

                bookingId,

                sessionId:
                    session.id,

                emailSent,

                url:
                    session.url

            });

        } catch (error) {

            console.error(
                "================================="
            );

            console.error(
                "❌ STRIPE ERROR"
            );

            console.error(
                error
            );

            console.error(
                "Message:",
                error.message
            );

            console.error(
                "================================="
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Payment error"

            });

        }

    }
);


// ============================================================
// CREATE CONTRACT PDF
// ============================================================

function createContractPDF(
    contract
) {

    return new Promise(
        (resolve, reject) => {

            try {

                const folder =
                    path.join(
                        __dirname,
                        "contracts"
                    );

                if (
                    !fs.existsSync(
                        folder
                    )
                ) {

                    fs.mkdirSync(
                        folder,
                        {
                            recursive: true
                        }
                    );

                }

                const filename =
                    "contract_" +
                    Date.now() +
                    "_" +
                    Math.random()
                        .toString(36)
                        .substring(2, 8) +
                    ".pdf";

                const filepath =
                    path.join(
                        folder,
                        filename
                    );

                const doc =
                    new PDFDocument({

                        size:
                            "LETTER",

                        margin:
                            60

                    });

                const stream =
                    fs.createWriteStream(
                        filepath
                    );

                doc.pipe(
                    stream
                );

                // ================= HEADER =================

                doc
                    .fontSize(20)
                    .text(
                        "My DMV Cleaning Services LLC",
                        {
                            align:
                                "center"
                        }
                    );

                doc.moveDown();

                doc
                    .fontSize(15)
                    .text(
                        "Cleaning Service Agreement",
                        {
                            align:
                                "center"
                        }
                    );

                doc.moveDown(2);

                // ================= CUSTOMER =================

                doc
                    .fontSize(12)
                    .text(
                        "Customer Information"
                    );

                doc.moveDown();

                doc.text(
                    "Name: " +
                    safeString(
                        contract.name
                    )
                );

                doc.text(
                    "Email: " +
                    safeString(
                        contract.email
                    )
                );

                doc.text(
                    "Phone: " +
                    safeString(
                        contract.phone
                    )
                );

                doc.moveDown();

                doc.text(
                    "Agreement Type: " +
                    (
                        safeString(
                            contract.contractType
                        ) ||
                        "Service Agreement"
                    )
                );

                doc.moveDown(2);

                // ================= AGREEMENT =================

                doc
                    .fontSize(12)
                    .text(
                        "Cleaning Service Agreement"
                    );

                doc.moveDown();

                doc.text(
                    "The customer agrees to the cleaning service terms and conditions provided by My DMV Cleaning Services LLC."
                );

                doc.moveDown(2);

                // ================= SIGNATURE =================

                doc.text(
                    "Customer Signature:"
                );

                doc.moveDown();

                if (
                    contract.signature &&
                    typeof contract.signature === "string"
                ) {

                    try {

                        const base64 =
                            contract.signature.replace(
                                /^data:image\/png;base64,/,
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
                                width: 160
                            }
                        );

                        doc.moveDown();

                    } catch (signatureError) {

                        console.error(
                            "❌ SIGNATURE IMAGE ERROR:",
                            signatureError
                        );

                    }

                }

                doc.text(
                    "Signed Name: " +
                    safeString(
                        contract.typedName
                    )
                );

                doc.text(
                    "Date Signed: " +
                    new Date()
                        .toLocaleDateString()
                );

                doc.moveDown(2);

                doc
                    .fontSize(9)
                    .text(
                        "My DMV Cleaning Services LLC | 703-967-0674"
                    );

                doc.end();

                stream.on(
                    "finish",
                    () => {

                        console.log(
                            "✅ CONTRACT PDF CREATED:",
                            filename
                        );

                        resolve(
                            "/contracts/" +
                            filename
                        );

                    }
                );

                stream.on(
                    "error",
                    (error) => {

                        console.error(
                            "❌ PDF WRITE ERROR:",
                            error
                        );

                        reject(
                            error
                        );

                    }
                );

            } catch (error) {

                console.error(
                    "❌ PDF CREATION ERROR:",
                    error
                );

                reject(
                    error
                );

            }

        }
    );

}


// ============================================================
// CONTRACT API
// ============================================================

app.post(
    "/api/contracts",
    async (req, res) => {

        try {

            const name =
                safeString(
                    req.body.name
                );

            const email =
                safeString(
                    req.body.email
                );

            const phone =
                safeString(
                    req.body.phone
                );

            const contractType =
                safeString(
                    req.body.contractType
                );

            const typedName =
                safeString(
                    req.body.typedName
                );

            const signature =
                req.body.signature;

            console.log(
                "📄 CONTRACT REQUEST:",
                {
                    name,
                    email,
                    phone,
                    contractType,
                    typedName,
                    hasSignature:
                        Boolean(signature)
                }
            );

            if (!name) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Name is required"

                });

            }

            if (!email) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Email is required"

                });

            }

            if (!typedName) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Typed name/signature is required"

                });

            }

            const pdfUrl =
                await createContractPDF({

                    name,
                    email,
                    phone,
                    contractType,
                    typedName,
                    signature

                });

            const result =
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

                    VALUES (?, ?, ?, ?, ?, ?, ?)

                `).run(

                    name,
                    email,
                    phone,
                    contractType ||
                        "Service Agreement",
                    typedName,
                    pdfUrl,
                    new Date().toISOString()

                );

            const contractId =
                Number(
                    result.lastInsertRowid
                );

            const publicPdfUrl =
                `${BACKEND_URL}${pdfUrl}`;

            let emailSent =
                false;

            try {

                await sendEmail({

                    to:
                        email,

                    subject:
                        "Your Cleaning Service Agreement - My DMV Cleaning Services LLC",

                    html: `

                        <h2>
                            Cleaning Service Agreement
                        </h2>

                        <p>
                            Hello ${name},
                        </p>

                        <p>
                            Your cleaning service agreement has been created successfully.
                        </p>

                        <p>
                            <strong>
                                Signed Name:
                            </strong>
                            ${typedName}
                        </p>

                        <p>
                            <a
                                href="${publicPdfUrl}"
                            >
                                View / Download Your Contract PDF
                            </a>
                        </p>

                        <p>
                            My DMV Cleaning Services LLC
                        </p>

                        <p>
                            703-967-0674
                        </p>

                    `

                });

                emailSent =
                    true;

            } catch (emailError) {

                console.error(
                    "❌ CONTRACT EMAIL FAILED:"
                );

                console.error(
                    emailError
                );

            }

            return res.json({

                success: true,

                contractId,

                pdfUrl:
                    publicPdfUrl,

                emailSent,

                message:
                    "Contract created successfully"

            });

        } catch (error) {

            console.error(
                "❌ CONTRACT API ERROR:"
            );

            console.error(
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// ADMIN LOGIN
// ============================================================

app.post(
    "/api/admin/login",
    (req, res) => {

        const username =
            safeString(
                req.body.username
            );

        const password =
            safeString(
                req.body.password
            );

        if (
            username === ADMIN_USER &&
            password === ADMIN_PASS
        ) {

            const token =
                jwt.sign(

                    {
                        role:
                            "admin"
                    },

                    SECRET,

                    {
                        expiresIn:
                            "2h"
                    }

                );

            return res.json({

                success: true,

                token

            });

        }

        return res.status(401).json({

            success: false,

            error:
                "Invalid username or password"

        });

    }
);


// ============================================================
// ADMIN BOOKINGS
// ============================================================

app.get(
    "/api/admin/bookings",
    verifyAdmin,
    (req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT *

                    FROM bookings

                    ORDER BY id DESC

                `).all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                "❌ ADMIN BOOKINGS ERROR:",
                error
            );

            return res.status(500).json([]);

        }

    }
);


// ============================================================
// UPDATE BOOKING STATUS
// ============================================================

app.put(
    "/api/admin/bookings/:id",
    verifyAdmin,
    (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const status =
                safeString(
                    req.body.status
                );

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid booking ID"

                });

            }

            if (!status) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Status is required"

                });

            }

            const result =
                db.prepare(`

                    UPDATE bookings

                    SET status = ?

                    WHERE id = ?

                `).run(

                    status,
                    id

                );

            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Booking not found"

                });

            }

            return res.json({

                success: true

            });

        } catch (error) {

            console.error(
                "❌ UPDATE BOOKING ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// DELETE BOOKING
// ============================================================

app.delete(
    "/api/admin/bookings/:id",
    verifyAdmin,
    (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid booking ID"

                });

            }

            const result =
                db.prepare(`

                    DELETE FROM bookings

                    WHERE id = ?

                `).run(
                    id
                );

            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Booking not found"

                });

            }

            return res.json({

                success: true

            });

        } catch (error) {

            console.error(
                "❌ DELETE BOOKING ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// ADMIN CONTRACTS
// ============================================================

app.get(
    "/api/admin/contracts",
    verifyAdmin,
    (req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT *

                    FROM contracts

                    ORDER BY id DESC

                `).all();

            return res.json(
                rows
            );

        } catch (error) {

            console.error(
                "❌ ADMIN CONTRACT ERROR:",
                error
            );

            return res.status(500).json([]);

        }

    }
);


// ============================================================
// DELETE CONTRACT
// ============================================================

app.delete(
    "/api/admin/contracts/:id",
    verifyAdmin,
    (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid contract ID"

                });

            }

            const contract =
                db.prepare(`

                    SELECT pdfUrl

                    FROM contracts

                    WHERE id = ?

                `).get(
                    id
                );

            const result =
                db.prepare(`

                    DELETE FROM contracts

                    WHERE id = ?

                `).run(
                    id
                );

            if (
                result.changes === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Contract not found"

                });

            }

            if (
                contract &&
                contract.pdfUrl
            ) {

                const filename =
                    path.basename(
                        contract.pdfUrl
                    );

                const filepath =
                    path.join(
                        __dirname,
                        "contracts",
                        filename
                    );

                if (
                    fs.existsSync(
                        filepath
                    )
                ) {

                    fs.unlinkSync(
                        filepath
                    );

                    console.log(
                        "🗑️ Deleted contract PDF:",
                        filename
                    );

                }

            }

            return res.json({

                success: true

            });

        } catch (error) {

            console.error(
                "❌ DELETE CONTRACT ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// GET SINGLE BOOKING
// ============================================================

app.get(
    "/api/booking/:id",
    (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    error:
                        "Invalid booking ID"

                });

            }

            const booking =
                db.prepare(`

                    SELECT *

                    FROM bookings

                    WHERE id = ?

                    LIMIT 1

                `).get(
                    id
                );

            if (!booking) {

                return res.status(404).json({

                    error:
                        "Booking not found"

                });

            }

            return res.json(
                booking
            );

        } catch (error) {

            console.error(
                "❌ GET BOOKING ERROR:",
                error
            );

            return res.status(500).json({

                error:
                    "Server error"

            });

        }

    }
);


// ============================================================
// PUBLIC CONTRACT PDF FILES
// ============================================================

app.use(
    "/contracts",
    express.static(
        path.join(
            __dirname,
            "contracts"
        )
    )
);


// ============================================================
// PUBLIC INVOICE PDF FILES
// ============================================================

app.use(
    "/invoices",
    express.static(
        path.join(
            __dirname,
            "invoices"
        )
    )
);


// ============================================================
// FRONTEND PUBLIC FOLDER
// ============================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// ============================================================
// ROOT TEST
// ============================================================

app.get(
    "/api/test",
    (req, res) => {

        return res.json({

            message:
                "Backend working",

            time:
                new Date().toISOString(),

            frontend:
                FRONTEND_URL,

            backend:
                BACKEND_URL,

            stripe:
                Boolean(
                    process.env.STRIPE_SECRET_KEY
                ),

            email:
                Boolean(
                    process.env.EMAIL_USER &&
                    process.env.EMAIL_PASS
                ),

            sqlite:
                true

        });

    }
);


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/health",
    (req, res) => {

        return res.json({

            status:
                "ok",

            service:
                "My DMV Cleaning Services LLC",

            time:
                new Date().toISOString()

        });

    }
);


// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        console.error(
            "❌ 404:",
            req.method,
            req.originalUrl
        );

        return res.status(404).json({

            error:
                "Route not found",

            path:
                req.originalUrl

        });

    }
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "================================="
        );

        console.error(
            "❌ GLOBAL SERVER ERROR"
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "Internal server error"

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
            "================================="
        );

        console.log(
            "🚀 My DMV Cleaning Services LLC"
        );

        console.log(
            "🚀 Server running on port:",
            PORT
        );

        console.log(
            "🌐 Frontend:",
            FRONTEND_URL
        );

        console.log(
            "🔗 Backend:",
            BACKEND_URL
        );

        console.log(
            "💳 Stripe:",
            stripe
                ? "CONFIGURED"
                : "MISSING"
        );

        console.log(
            "📧 Email:",
            process.env.EMAIL_USER &&
            process.env.EMAIL_PASS
                ? "CONFIGURED"
                : "MISSING"
        );

        console.log(
            "🗄️ SQLite: READY"
        );

        console.log(
            "📄 Contract PDFs: READY"
        );

        console.log(
            "================================="
        );

    }
);