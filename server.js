
"use strict";

// ============================================================
// My DMV Cleaning Services LLC
// PRODUCTION SERVER
// ============================================================

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

// ============================================================
// ENVIRONMENT
// ============================================================

dotenv.config();

// ============================================================
// APP
// ============================================================

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 5000;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "http://127.0.0.1:5000";

const ADMIN_EMAIL =
    process.env.EMAIL_USER || "";

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "admin";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "admin123";

const JWT_SECRET =
    process.env.JWT_SECRET || "mydmv-secret-key";

// ============================================================
// CREATE FOLDERS
// ============================================================

const folders = [
    "public/signed-contracts",
    "public/invoices",
    "public/uploads",
    "public/uploads/signatures",
    "public/contracts"
];

folders.forEach((folder) => {
    const folderPath = path.join(__dirname, folder);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, {
            recursive: true
        });

        console.log("Created:", folder);
    }
});

// ============================================================
// STRIPE
// ============================================================

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("Stripe service configured");
} else {
    console.log("WARNING: STRIPE_SECRET_KEY is not configured");
}

// ============================================================
// STRIPE WEBHOOK
//
// IMPORTANT:
// This route MUST be before express.json() because Stripe
// requires the raw request body for signature verification.
// ============================================================

app.post(
    "/api/stripe-webhook",
    express.raw({
        type: "application/json"
    }),
    async (req, res) => {
        if (!stripe) {
            return res.status(500).send("Stripe is not configured");
        }

        const webhookSecret =
            process.env.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error(
                "STRIPE_WEBHOOK_SECRET is not configured"
            );

            return res.status(500).send(
                "Stripe webhook secret is not configured"
            );
        }

        const signature =
            req.headers["stripe-signature"];

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                signature,
                webhookSecret
            );
        } catch (error) {
            console.error(
                "Stripe webhook signature error:",
                error.message
            );

            return res.status(400).send(
                `Webhook Error: ${error.message}`
            );
        }

        try {
            console.log(
                "Stripe webhook received:",
                event.type
            );

            // ====================================================
            // PAYMENT COMPLETED
            // ====================================================

            if (
                event.type ===
                "checkout.session.completed"
            ) {
                const session = event.data.object;

                const booking =
                    db.prepare(`
                        SELECT *
                        FROM bookings
                        WHERE stripeSession = ?
                    `).get(session.id);

                if (!booking) {
                    console.log(
                        "Stripe payment completed but booking was not found:",
                        session.id
                    );

                    return res.json({
                        received: true
                    });
                }

                // Prevent duplicate confirmation emails.
                const alreadyPaid =
                    String(
                        booking.status || ""
                    ).toLowerCase() === "paid";

                // Update booking payment status.
                db.prepare(`
                    UPDATE bookings
                    SET status = ?
                    WHERE id = ?
                `).run(
                    "paid",
                    booking.id
                );

                console.log(
                    `Booking #${booking.id} marked as paid`
                );

                // ------------------------------------------------
                // Only send confirmation emails once.
                // ------------------------------------------------

                if (!alreadyPaid) {
                    const updatedBooking =
                        db.prepare(`
                            SELECT *
                            FROM bookings
                            WHERE id = ?
                        `).get(booking.id);

                    // CUSTOMER PAYMENT CONFIRMATION

                    await sendEmail({
                        to: updatedBooking.email,
                        subject:
                            "My DMV Cleaning Services - Deposit Payment Confirmed",
                        html: `
                            <div style="font-family:Arial,sans-serif;line-height:1.6">
                                <h2>Deposit Payment Confirmed</h2>

                                <p>
                                    Hello ${escapeHtml(updatedBooking.name)},
                                </p>

                                <p>
                                    Your cleaning appointment has been received
                                    and your deposit payment has been successfully
                                    processed.
                                </p>

                                <hr>

                                <p>
                                    <strong>Booking ID:</strong>
                                    ${updatedBooking.id}
                                </p>

                                <p>
                                    <strong>Service:</strong>
                                    ${escapeHtml(updatedBooking.service)}
                                </p>

                                <p>
                                    <strong>Date:</strong>
                                    ${escapeHtml(updatedBooking.date)}
                                </p>

                                <p>
                                    <strong>Time:</strong>
                                    ${escapeHtml(updatedBooking.timeSlot)}
                                </p>

                                <p>
                                    <strong>Total Price:</strong>
                                    $${Number(
                                        updatedBooking.price || 0
                                    ).toFixed(2)}
                                </p>

                                <p>
                                    <strong>Deposit Paid:</strong>
                                    $${Number(
                                        updatedBooking.deposit || 0
                                    ).toFixed(2)}
                                </p>

                                <p>
                                    <strong>Remaining Balance:</strong>
                                    $${Number(
                                        updatedBooking.remaining || 0
                                    ).toFixed(2)}
                                </p>

                                <p>
                                    <strong>Payment Status:</strong>
                                    Deposit Paid
                                </p>

                                <hr>

                                <p>
                                    Thank you for choosing
                                    My DMV Cleaning Services LLC.
                                </p>
                            </div>
                        `
                    });

                    // ADMIN PAYMENT NOTIFICATION

                    if (ADMIN_EMAIL) {
                        await sendEmail({
                            to: ADMIN_EMAIL,
                            subject:
                                `Deposit Paid - Booking #${updatedBooking.id}`,
                            html: `
                                <div style="font-family:Arial,sans-serif;line-height:1.6">
                                    <h2>Cleaning Booking Deposit Paid</h2>

                                    <p>
                                        A customer has successfully paid
                                        the booking deposit.
                                    </p>

                                    <hr>

                                    <p>
                                        <strong>Booking ID:</strong>
                                        ${updatedBooking.id}
                                    </p>

                                    <p>
                                        <strong>Name:</strong>
                                        ${escapeHtml(updatedBooking.name)}
                                    </p>

                                    <p>
                                        <strong>Email:</strong>
                                        ${escapeHtml(updatedBooking.email)}
                                    </p>

                                    <p>
                                        <strong>Phone:</strong>
                                        ${escapeHtml(updatedBooking.phone)}
                                    </p>

                                    <p>
                                        <strong>Address:</strong>
                                        ${escapeHtml(updatedBooking.address)}
                                    </p>

                                    <p>
                                        <strong>Service:</strong>
                                        ${escapeHtml(updatedBooking.service)}
                                    </p>

                                    <p>
                                        <strong>Date:</strong>
                                        ${escapeHtml(updatedBooking.date)}
                                    </p>

                                    <p>
                                        <strong>Time:</strong>
                                        ${escapeHtml(updatedBooking.timeSlot)}
                                    </p>

                                    <p>
                                        <strong>Total:</strong>
                                        $${Number(
                                            updatedBooking.price || 0
                                        ).toFixed(2)}
                                    </p>

                                    <p>
                                        <strong>Deposit:</strong>
                                        $${Number(
                                            updatedBooking.deposit || 0
                                        ).toFixed(2)}
                                    </p>

                                    <p>
                                        <strong>Remaining:</strong>
                                        $${Number(
                                            updatedBooking.remaining || 0
                                        ).toFixed(2)}
                                    </p>

                                    <p>
                                        <strong>Stripe Session:</strong>
                                        ${escapeHtml(
                                            updatedBooking.stripeSession
                                        )}
                                    </p>
                                </div>
                            `
                        });
                    }
                }
            }

            // ====================================================
            // CHECKOUT EXPIRED
            // ====================================================

            if (
                event.type ===
                "checkout.session.expired"
            ) {
                const session = event.data.object;

                const booking =
                    db.prepare(`
                        SELECT *
                        FROM bookings
                        WHERE stripeSession = ?
                    `).get(session.id);

                if (booking) {
                    db.prepare(`
                        UPDATE bookings
                        SET status = ?
                        WHERE id = ?
                    `).run(
                        "payment_expired",
                        booking.id
                    );

                    console.log(
                        `Booking #${booking.id} payment expired`
                    );
                }
            }

            return res.json({
                received: true
            });

        } catch (error) {
            console.error(
                "Stripe webhook processing error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Webhook processing failed"
            });
        }
    }
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

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
// STATIC WEBSITE
// ============================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ============================================================
// DATABASE
// ============================================================

const db = new Database(
    path.join(
        __dirname,
        "bookings.db"
    )
);

db.pragma("journal_mode = WAL");

// ============================================================
// BOOKINGS TABLE
// ============================================================

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

// ============================================================
// CONTACTS TABLE
// ============================================================

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

// ============================================================
// CONTRACTS TABLE
// ============================================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bookingId INTEGER,
        name TEXT,
        email TEXT,
        phone TEXT,
        contractType TEXT,
        typedName TEXT,
        signature TEXT,
        pdfUrl TEXT,
        businessName TEXT,
        address TEXT,
        experience TEXT,
        services TEXT,
        availability TEXT,
        license TEXT,
        insurance TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// ============================================================
// DATABASE MIGRATION HELPER
// ============================================================

function ensureColumn(
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
                item => item.name === column
            );

        if (!exists) {
            db.prepare(
                `ALTER TABLE ${table}
                 ADD COLUMN ${column} ${definition}`
            ).run();

            console.log(
                `Added ${column} column to ${table}`
            );
        }
    } catch (error) {
        console.error(
            `Migration error for ${table}.${column}:`,
            error.message
        );
    }
}

// ============================================================
// BOOKING MIGRATIONS
// ============================================================

ensureColumn(
    "bookings",
    "stripePaymentIntent",
    "TEXT"
);

ensureColumn(
    "bookings",
    "paidAt",
    "TEXT"
);

// ============================================================
// CONTRACT MIGRATIONS
// ============================================================

ensureColumn(
    "contracts",
    "businessType",
    "TEXT"
);

ensureColumn(
    "contracts",
    "serviceArea",
    "TEXT"
);

ensureColumn(
    "contracts",
    "requirementsConfirmed",
    "INTEGER DEFAULT 0"
);

ensureColumn(
    "contracts",
    "agreementAccepted",
    "INTEGER DEFAULT 0"
);

ensureColumn(
    "contracts",
    "signedAt",
    "TEXT"
);

ensureColumn(
    "contracts",
    "approvalStatus",
    "TEXT DEFAULT 'pending'"
);

console.log(
    "Database connected successfully"
);

// ============================================================
// EMAIL SYSTEM
// ============================================================

const transporter =
    nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });

// ============================================================
// EMAIL HELPER
// ============================================================

async function sendEmail({
    to,
    subject,
    html
}) {
    if (!to) {
        console.log(
            "Email skipped: no recipient"
        );

        return false;
    }

    if (
        !process.env.EMAIL_USER ||
        !process.env.EMAIL_PASS
    ) {
        console.error(
            "Email skipped: EMAIL_USER or EMAIL_PASS not configured"
        );

        return false;
    }

    try {
        const info =
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to,
                subject,
                html
            });

        console.log(
            "Email sent successfully:",
            to
        );

        console.log(
            "Message ID:",
            info.messageId
        );

        return true;

    } catch (error) {
        console.error(
            "============================================================"
        );

        console.error(
            "EMAIL SEND ERROR"
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Code:",
            error.code || "N/A"
        );

        console.error(
            "Response:",
            error.response || "N/A"
        );

        console.error(
            "Command:",
            error.command || "N/A"
        );

        console.error(
            "============================================================"
        );

        return false;
    }
}
// 

// ============================================================
// EMAIL TEST
// ============================================================

app.get(
    "/api/test-email",
    async (req, res) => {
        try {
            if (
                !process.env.EMAIL_USER ||
                !process.env.EMAIL_PASS
            ) {
                return res.status(500).json({
                    success: false,
                    message:
                        "EMAIL_USER or EMAIL_PASS is not configured"
                });
            }

            console.log(
                "Testing Gmail SMTP connection..."
            );

            await transporter.verify();

            console.log(
                "Gmail SMTP connection verified successfully"
            );

            const info =
                await transporter.sendMail({
                    from:
                        process.env.EMAIL_USER,

                    to:
                        process.env.EMAIL_USER,

                    subject:
                        "My DMV Cleaning Services - Local Email Test",

                    html: `
                        <div style="
                            font-family:Arial,sans-serif;
                            line-height:1.6;
                            max-width:600px;
                            margin:auto;
                        ">

                            <h2>
                                Email Test Successful
                            </h2>

                            <p>
                                This is a test email from
                                the local My DMV Cleaning Services
                                server.
                            </p>

                            <hr>

                            <p>
                                <strong>Service:</strong>
                                My DMV Cleaning Services LLC
                            </p>

                            <p>
                                <strong>Server:</strong>
                                Local Node.js server
                            </p>

                            <p>
                                <strong>Time:</strong>
                                ${new Date().toLocaleString()}
                            </p>

                            <p>
                                Gmail SMTP is working correctly.
                            </p>

                        </div>
                    `
                });

            console.log(
                "TEST EMAIL SENT:"
            );

            console.log(
                "Message ID:",
                info.messageId
            );

            return res.json({
                success: true,
                message:
                    "Test email sent successfully",
                messageId:
                    info.messageId
            });

        } catch (error) {
            console.error(
                "============================================================"
            );

            console.error(
                "TEST EMAIL ERROR"
            );

            console.error(
                "Message:",
                error.message
            );

            console.error(
                "Code:",
                error.code || "N/A"
            );

            console.error(
                "Response:",
                error.response || "N/A"
            );

            console.error(
                "Command:",
                error.command || "N/A"
            );

            console.error(
                "============================================================"
            );

            return res.status(500).json({
                success: false,
                message:
                    "Email test failed",
                error:
                    error.message,
                code:
                    error.code || null
            });
        }
    }
);
// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// ADMIN LOGIN
// ============================================================

app.post(
    "/api/admin/login",
    (req, res) => {
        const {
            username,
            password
        } = req.body;

        if (
            username === ADMIN_USERNAME &&
            password === ADMIN_PASSWORD
        ) {
            const token =
                jwt.sign(
                    { username },
                    JWT_SECRET,
                    {
                        expiresIn: "8h"
                    }
                );

            return res.json({
                success: true,
                token
            });
        }

        return res.status(401).json({
            success: false,
            message: "Invalid login"
        });
    }
);

// ============================================================
// ADMIN AUTH
// ============================================================

function verifyAdmin(
    req,
    res,
    next
) {
    const header =
        req.headers.authorization;

    if (!header) {
        return res.status(401).json({
            success: false,
            message: "No token"
        });
    }

    const parts =
        header.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {
        return res.status(401).json({
            success: false,
            message: "Invalid authorization header"
        });
    }

    try {
        const decoded =
            jwt.verify(
                parts[1],
                JWT_SECRET
            );

        req.admin = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
}

// ============================================================
// GET BOOKED SLOTS
// ============================================================

app.get(
    "/api/booked-slots/:date",
    (req, res) => {
        try {
            const rows =
                db.prepare(`
                    SELECT timeSlot
                    FROM bookings
                    WHERE date = ?
                    AND status != 'cancelled'
                    AND status != 'payment_expired'
                `).all(
                    req.params.date
                );

            const bookedSlots =
                rows.flatMap(item => {
                    const slot =
                        String(
                            item.timeSlot || ""
                        ).trim();

                    const match =
                        slot.match(
                            /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
                        );

                    if (!match) {
                        return slot
                            ? [slot]
                            : [];
                    }

                    let hour =
                        parseInt(
                            match[1],
                            10
                        );

                    const minutes =
                        match[2];

                    const period =
                        match[3].toUpperCase();

                    if (
                        period === "PM" &&
                        hour !== 12
                    ) {
                        hour += 12;
                    }

                    if (
                        period === "AM" &&
                        hour === 12
                    ) {
                        hour = 0;
                    }

                    const endHour =
                        hour + 2;

                    if (
                        endHour > 23
                    ) {
                        return [slot];
                    }

                    const start =
                        String(hour)
                            .padStart(2, "0") +
                        ":" +
                        minutes;

                    const end =
                        String(endHour)
                            .padStart(2, "0") +
                        ":" +
                        minutes;

                    return [
                        slot,
                        `${start} - ${end}`
                    ];
                });

            res.json({
                success: true,
                bookedSlots
            });

        } catch (error) {
            console.error(
                "BOOKED SLOTS ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Cannot load slots"
            });
        }
    }
);

// ============================================================
// CONTACT FORM
// ============================================================

app.post(
    "/api/contact",
    async (req, res) => {
        try {
            const {
                name,
                email,
                phone,
                message
            } = req.body;

            if (
                !name ||
                !email ||
                !message
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email, and message are required"
                });
            }

            const result =
                db.prepare(`
                    INSERT INTO contacts
                    (
                        name,
                        email,
                        phone,
                        message
                    )
                    VALUES (?, ?, ?, ?)
                `).run(
                    name,
                    email,
                    phone || null,
                    message
                );

            await sendEmail({
                to: ADMIN_EMAIL,
                subject:
                    "New Website Contact Message",
                html: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>New Contact Message</h2>

                        <p>
                            <strong>Contact ID:</strong>
                            ${result.lastInsertRowid}
                        </p>

                        <p>
                            <strong>Name:</strong>
                            ${escapeHtml(name)}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${escapeHtml(email)}
                        </p>

                        <p>
                            <strong>Phone:</strong>
                            ${escapeHtml(phone)}
                        </p>

                        <p>
                            <strong>Message:</strong>
                        </p>

                        <p>
                            ${escapeHtml(message)}
                        </p>
                    </div>
                `
            });

            res.json({
                success: true,
                message: "Message sent"
            });

        } catch (error) {
            console.error(
                "CONTACT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Contact failed"
            });
        }
    }
);

// ============================================================
// ADMIN VIEW CONTACTS
// ============================================================

app.get(
    "/api/admin/contacts",
    verifyAdmin,
    (req, res) => {
        try {
            const contacts =
                db.prepare(`
                    SELECT *
                    FROM contacts
                    ORDER BY id DESC
                `).all();

            res.json({
                success: true,
                contacts
            });

        } catch (error) {
            console.error(
                "GET CONTACTS ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not load contacts"
            });
        }
    }
);

// ============================================================
// ADMIN DELETE CONTACT
// ============================================================

app.delete(
    "/api/admin/contacts/:id",
    verifyAdmin,
    (req, res) => {
        try {
            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid contact ID"
                });
            }

            const result =
                db.prepare(`
                    DELETE FROM contacts
                    WHERE id = ?
                `).run(id);

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Contact message not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Contact message deleted"
            });

        } catch (error) {
            console.error(
                "DELETE CONTACT ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not delete contact message"
            });
        }
    }
);

// ============================================================
// ADMIN EDIT CONTACT
// ============================================================

app.put(
    "/api/admin/contacts/:id",
    verifyAdmin,
    (req, res) => {
        try {
            const id =
                Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid contact ID"
                });
            }

            const message =
                String(
                    req.body.message || ""
                ).trim();

            const status =
                String(
                    req.body.status || "new"
                ).trim();

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Message cannot be empty"
                });
            }

            const allowedStatuses = [
                "new",
                "read",
                "replied"
            ];

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid contact status"
                });
            }

            const result =
                db.prepare(`
                    UPDATE contacts
                    SET message = ?,
                        status = ?
                    WHERE id = ?
                `).run(
                    message,
                    status,
                    id
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Contact message not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Contact message updated"
            });

        } catch (error) {
            console.error(
                "CONTACT UPDATE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not update contact message"
            });
        }
    }
);

// ============================================================
// PAY LATER BOOKING
// ============================================================

app.post(
    "/api/book-pay-later",
    async (req, res) => {
        try {
            const {
                name,
                email,
                phone,
                address,
                service,
                price,
                deposit,
                remaining,
                date,
                timeSlot
            } = req.body;

            if (
                !name ||
                !email ||
                !date ||
                !timeSlot
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email, date, and time are required"
                });
            }

            // -----------------------------------------------
            // CHECK SLOT
            // -----------------------------------------------

            const existing =
                db.prepare(`
                    SELECT id
                    FROM bookings
                    WHERE date = ?
                    AND timeSlot = ?
                    AND status != 'cancelled'
                    AND status != 'payment_expired'
                `).get(
                    date,
                    timeSlot
                );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message:
                        "This time is already booked. Please select another time."
                });
            }

            // -----------------------------------------------
            // SAVE BOOKING FIRST
            // -----------------------------------------------

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
                        paymentType,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    name,
                    email,
                    phone || null,
                    address || null,
                    service || null,
                    Number(price) || 0,
                    Number(deposit) || 0,
                    Number(remaining) || 0,
                    date,
                    timeSlot,
                    "Pay Later",
                    "pending"
                );

            const bookingId =
                result.lastInsertRowid;

            // -----------------------------------------------
            // CUSTOMER CONFIRMATION
            // -----------------------------------------------

          // -----------------------------------------------
// CUSTOMER CONFIRMATION
// -----------------------------------------------

console.log(
    `Sending customer booking confirmation for Booking #${bookingId} to:`,
    email
);

const customerEmailSent =
    await sendEmail({
        to: email,
        subject:
            "My DMV Cleaning Services - Booking Received",
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
                <h2>Booking Received</h2>

                <p>
                    Hello ${escapeHtml(name)},
                </p>

                <p>
                    Thank you for choosing
                    My DMV Cleaning Services LLC.
                    Your booking request has been received.
                </p>

                <hr>

                <p>
                    <strong>Booking ID:</strong>
                    ${bookingId}
                </p>

                <p>
                    <strong>Service:</strong>
                    ${escapeHtml(service)}
                </p>

                <p>
                    <strong>Date:</strong>
                    ${escapeHtml(date)}
                </p>

                <p>
                    <strong>Time:</strong>
                    ${escapeHtml(timeSlot)}
                </p>

                <p>
                    <strong>Total Price:</strong>
                    $${Number(price || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Deposit:</strong>
                    $${Number(deposit || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Remaining:</strong>
                    $${Number(remaining || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Payment Type:</strong>
                    Pay Later
                </p>

                <p>
                    <strong>Status:</strong>
                    Pending Confirmation
                </p>

                <hr>

                <p>
                    We will review your booking and
                    contact you if anything needs to be
                    confirmed or changed.
                </p>

                <p>
                    Thank you for choosing
                    <strong>My DMV Cleaning Services LLC</strong>.
                </p>
            </div>
        `
    });

console.log(
    `Customer email result for Booking #${bookingId}:`,
    customerEmailSent ? "SENT" : "FAILED"
);


// -----------------------------------------------
// ADMIN NOTIFICATION
// -----------------------------------------------

console.log(
    `Sending admin booking notification for Booking #${bookingId} to:`,
    ADMIN_EMAIL || "(NO ADMIN EMAIL)"
);

const adminEmailSent =
    await sendEmail({
        to: ADMIN_EMAIL,
        subject:
            `New Cleaning Booking #${bookingId}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
                <h2>New Cleaning Booking</h2>

                <p>
                    <strong>Booking ID:</strong>
                    ${bookingId}
                </p>

                <p>
                    <strong>Name:</strong>
                    ${escapeHtml(name)}
                </p>

                <p>
                    <strong>Email:</strong>
                    ${escapeHtml(email)}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${escapeHtml(phone)}
                </p>

                <p>
                    <strong>Address:</strong>
                    ${escapeHtml(address)}
                </p>

                <p>
                    <strong>Service:</strong>
                    ${escapeHtml(service)}
                </p>

                <p>
                    <strong>Date:</strong>
                    ${escapeHtml(date)}
                </p>

                <p>
                    <strong>Time:</strong>
                    ${escapeHtml(timeSlot)}
                </p>

                <p>
                    <strong>Total:</strong>
                    $${Number(price || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Deposit:</strong>
                    $${Number(deposit || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Remaining:</strong>
                    $${Number(remaining || 0).toFixed(2)}
                </p>

                <p>
                    <strong>Payment Type:</strong>
                    Pay Later
                </p>

                <p>
                    <strong>Status:</strong>
                    Pending
                </p>
            </div>
        `
    });

console.log(
    `Admin email result for Booking #${bookingId}:`,
    adminEmailSent ? "SENT" : "FAILED"
);
            // -----------------------------------------------
            // ADMIN NOTIFICATION
            // -----------------------------------------------

            await sendEmail({
                to: ADMIN_EMAIL,
                subject:
                    `New Cleaning Booking #${bookingId}`,
                html: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>New Cleaning Booking</h2>

                        <p>
                            <strong>Booking ID:</strong>
                            ${bookingId}
                        </p>

                        <p>
                            <strong>Name:</strong>
                            ${escapeHtml(name)}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${escapeHtml(email)}
                        </p>

                        <p>
                            <strong>Phone:</strong>
                            ${escapeHtml(phone)}
                        </p>

                        <p>
                            <strong>Address:</strong>
                            ${escapeHtml(address)}
                        </p>

                        <p>
                            <strong>Service:</strong>
                            ${escapeHtml(service)}
                        </p>

                        <p>
                            <strong>Date:</strong>
                            ${escapeHtml(date)}
                        </p>

                        <p>
                            <strong>Time:</strong>
                            ${escapeHtml(timeSlot)}
                        </p>

                        <p>
                            <strong>Total:</strong>
                            $${Number(price || 0).toFixed(2)}
                        </p>

                        <p>
                            <strong>Deposit:</strong>
                            $${Number(deposit || 0).toFixed(2)}
                        </p>

                        <p>
                            <strong>Remaining:</strong>
                            $${Number(remaining || 0).toFixed(2)}
                        </p>

                        <p>
                            <strong>Payment Type:</strong>
                            Pay Later
                        </p>

                        <p>
                            <strong>Status:</strong>
                            Pending
                        </p>
                    </div>
                `
            });

          res.json({
    success: true,
    bookingId,

    emailStatus: {
        customer: customerEmailSent,
        admin: adminEmailSent
    },

    message:
        customerEmailSent && adminEmailSent
            ? "Booking saved and confirmation emails sent"
            : "Booking saved, but one or more confirmation emails could not be sent"
});

        } catch (error) {
            console.error(
                "BOOKING ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Server error"
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
        try { get
            if (!stripe) {
                return res.status(500).json({
                    success: false,
                    message:
                        "Stripe is not configured"
                });
            }

            const {
                name,
                email,
                phone,
                address,
                service,
                price,
                deposit,
                remaining,
                date,
                timeSlot
            } = req.body;

            if (
                !name ||
                !email ||
                !date ||
                !timeSlot
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email, date, and time are required"
                });
            }

            // -----------------------------------------------
            // CHECK SLOT
            // -----------------------------------------------

            const existing =
                db.prepare(`
                    SELECT id
                    FROM bookings
                    WHERE date = ?
                    AND timeSlot = ?
                    AND status != 'cancelled'
                    AND status != 'payment_expired'
                `).get(
                    date,
                    timeSlot
                );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Appointment time already booked"
                });
            }

            const depositAmount =
                Number(deposit) || 0;

            if (
                depositAmount <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid deposit amount"
                });
            }

            // -----------------------------------------------
            // CREATE STRIPE CHECKOUT
            // -----------------------------------------------

            const session =
                await stripe.checkout.sessions.create({
                    payment_method_types: [
                        "card"
                    ],

                    mode: "payment",

                    customer_email:
                        email,

                    metadata: {
                        bookingType:
                            "cleaning_booking"
                    },

                    line_items: [
                        {
                            price_data: {
                                currency: "usd",

                                product_data: {
                                    name:
                                        `${service} Deposit`
                                },

                                unit_amount:
                                    Math.round(
                                        depositAmount * 100
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

            // -----------------------------------------------
            // SAVE BOOKING
            //
            // DO NOT send "paid" email here.
            // Stripe has not confirmed payment yet.
            // -----------------------------------------------

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
                        paymentType,
                        stripeSession,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    name,
                    email,
                    phone || null,
                    address || null,
                    service || null,
                    Number(price) || 0,
                    depositAmount,
                    Number(remaining) || 0,
                    date,
                    timeSlot,
                    "Deposit Paid",
                    session.id,
                    "pending"
                );

            console.log(
                "Stripe checkout created:",
                session.id
            );

            res.json({
                success: true,
                checkoutUrl:
                    session.url,
                bookingId:
                    result.lastInsertRowid
            });

        } catch (error) {
            console.error(
                "STRIPE CHECKOUT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Stripe payment failed"
            });
        }
    }
);

// ============================================================
// GET BOOKING BY ID
// ============================================================

// ============================================================
// GET BOOKING BY ID
// ============================================================

app.get(
    "/api/bookings/:id",
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
                    message:
                        "Booking not found"
                });
            }

            res.json({
                success: true,
                booking
            });

        } catch (error) {
            console.error(
                "GET BOOKING ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Server error"
            });
        }
    }
);

// ============================================================
// GET BOOKING BY STRIPE SESSION
// ============================================================

app.get(
    "/api/booking-session/:session",
    (req, res) => {
        try {
            const booking =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    WHERE stripeSession = ?
                `).get(
                    req.params.session
                );

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found"
                });
            }

            res.json({
                success: true,
                booking
            });

        } catch (error) {
            console.error(
                "BOOKING SESSION ERROR:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Server error"
            });
        }
    }
);

// ============================================================
// DOCUMENT STORAGE
// ============================================================

const contractsFolder =
    path.join(
        __dirname,
        "public",
        "contracts"
    );

const invoicesFolder =
    path.join(
        __dirname,
        "public",
        "invoices"
    );

if (!fs.existsSync(contractsFolder)) {
    fs.mkdirSync(
        contractsFolder,
        {
            recursive: true
        }
    );
}

if (!fs.existsSync(invoicesFolder)) {
    fs.mkdirSync(
        invoicesFolder,
        {
            recursive: true
        }
    );
}

// ============================================================
// SERVE CONTRACTS
// ============================================================

app.use(
    "/contracts",
    express.static(
        contractsFolder
    )
);

// ============================================================
// SERVE INVOICES
// ============================================================

app.use(
    "/invoices",
    express.static(
        invoicesFolder
    )
);

// ============================================================
// ADMIN GET BOOKINGS
// ============================================================

app.get(
    "/api/admin/bookings",
    verifyAdmin,
    (req, res) => {
        try {
            const bookings =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    ORDER BY id DESC
                `).all();

            res.json({
                success: true,
                bookings
            });

        } catch (error) {
            console.error(
                "ADMIN BOOKINGS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not load bookings"
            });
        }
    }
);

// ============================================================
// UPDATE BOOKING STATUS
// ============================================================

app.put(
    "/api/admin/bookings/:id/status",
    verifyAdmin,
    (req, res) => {
        try {
            const allowedStatuses = [
                "pending",
                "confirmed",
                "paid",
                "completed",
                "cancelled",
                "payment_expired"
            ];

            const status =
                String(
                    req.body.status || ""
                ).trim();

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid booking status"
                });
            }

            const result =
                db.prepare(`
                    UPDATE bookings
                    SET status = ?
                    WHERE id = ?
                `).run(
                    status,
                    req.params.id
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Status updated"
            });

        } catch (error) {
            console.error(
                "UPDATE BOOKING STATUS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not update booking"
            });
        }
    }
);

// ============================================================
// CANCEL BOOKING
// ============================================================

app.put(
    "/api/admin/bookings/:id/cancel",
    verifyAdmin,
    (req, res) => {
        try {
            const result =
                db.prepare(`
                    UPDATE bookings
                    SET status = 'cancelled'
                    WHERE id = ?
                `).run(
                    req.params.id
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Booking cancelled"
            });

        } catch (error) {
            console.error(
                "CANCEL BOOKING ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not cancel booking"
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
            const result =
                db.prepare(`
                    DELETE FROM bookings
                    WHERE id = ?
                `).run(
                    req.params.id
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Booking not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Booking deleted"
            });

        } catch (error) {
            console.error(
                "DELETE BOOKING ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not delete booking"
            });
        }
    }
);

// ============================================================
// ADMIN INVOICE PDF
// ============================================================

app.get(
    "/api/admin/invoice/:id",
    verifyAdmin,
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
                    message:
                        "Booking not found"
                });
            }

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
                    `Invoice #${booking.id}`
                );

            doc.moveDown();

            doc
                .fontSize(11)
                .font("Helvetica")
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

// ============================================================
// SIGNATURE DATA PARSER
// ============================================================

function signatureDataUrlToBuffer(
    signature
) {
    if (
        typeof signature !== "string"
    ) {
        return null;
    }

    const match =
        signature.match(
            /^data:image\/png;base64,(.+)$/i
        );

    if (!match) {
        return null;
    }

    try {
        return Buffer.from(
            match[1],
            "base64"
        );
    } catch (error) {
        return null;
    }
}

// ============================================================
// SAFE FILE NAME
// ============================================================

function makeSafeFileName(
    value
) {
    return String(value || "contract")
        .replace(
            /[^a-z0-9]/gi,
            "-"
        )
        .replace(
            /-+/g,
            "-"
        )
        .replace(
            /^-|-$/g,
            ""
        )
        .toLowerCase();
}

// ============================================================
// FORMAT SERVICES
// ============================================================

function formatServices(
    services
) {
    if (Array.isArray(services)) {
        return services.join(", ");
    }

    return String(
        services || ""
    );
}

// ============================================================
// CREATE CONTRACT PDF
// ============================================================

async function createContractPdf(
    data
) {
    const safeName =
        makeSafeFileName(
            data.name
        );

    const timestamp =
        Date.now();

    const fileName =
        `contract-${safeName}-${timestamp}.pdf`;

    const filePath =
        path.join(
            contractsFolder,
            fileName
        );

    const doc =
        new PDFDocument({
            margin: 50
        });

    const writeStream =
        fs.createWriteStream(
            filePath
        );

    doc.pipe(writeStream);

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
            data.contractType ||
                "Signed Agreement",
            {
                align: "center"
            }
        );

    doc.moveDown();

    doc
        .fontSize(10)
        .font("Helvetica")
        .text(
            `Document Date: ${
                new Date().toLocaleString()
            }`
        );

    doc.moveDown();

    // ========================================================
    // APPLICANT INFORMATION
    // ========================================================

    doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .text(
            "Applicant Information"
        );

    doc.moveDown(0.5);

    doc
        .fontSize(11)
        .font("Helvetica")
        .text(
            `Full Name: ${data.name || ""}`
        );

    doc.text(
        `Business Name: ${
            data.businessName || ""
        }`
    );

    doc.text(
        `Business Type: ${
            data.businessType || ""
        }`
    );

    doc.text(
        `Email: ${data.email || ""}`
    );

    doc.text(
        `Phone: ${data.phone || ""}`
    );

    doc.text(
        `Address: ${data.address || ""}`
    );

    doc.moveDown();

    // ========================================================
    // CONTRACTOR INFORMATION
    // ========================================================

    if (
        data.contractType ===
            "Independent Contractor Agreement" ||
        data.contractType ===
            "Independent Subcontractor Agreement"
    ) {
        doc
            .fontSize(13)
            .font("Helvetica-Bold")
            .text(
                "Independent Subcontractor Information"
            );

        doc.moveDown(0.5);

        doc
            .fontSize(11)
            .font("Helvetica")
            .text(
                `Service Area: ${
                    data.serviceArea ||
                    data.availability ||
                    ""
                }`
            );

        doc.text(
            `Experience: ${
                data.experience || ""
            }`
        );

        doc.text(
            `Services: ${
                formatServices(
                    data.services
                )
            }`
        );

        doc.text(
            `Availability: ${
                data.availability || ""
            }`
        );

        doc.text(
            `License / Certification: ${
                data.license || ""
            }`
        );

        doc.text(
            `Insurance: ${
                data.insurance || ""
            }`
        );

        doc.moveDown();
    }

    // ========================================================
    // CLIENT SERVICE INFORMATION
    // ========================================================

    if (
        data.contractType ===
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
                `Service Address: ${
                    data.address || ""
                }`
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
                data.serviceDescription ||
                    ""
            );

        doc.moveDown();
    }

    // ========================================================
    // JOB COMPLETION
    // ========================================================

    if (
        data.contractType ===
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
                data.jobDescription ||
                    ""
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
                data.completionNotes ||
                    ""
            );

        doc.moveDown();
    }

    // ========================================================
    // AGREEMENT ACKNOWLEDGMENTS
    // ========================================================

    if (
        data.contractType ===
        "Independent Subcontractor Agreement"
    ) {
        doc
            .fontSize(13)
            .font("Helvetica-Bold")
            .text(
                "Agreement Acknowledgments"
            );

        doc.moveDown(0.5);

        doc
            .fontSize(10)
            .font("Helvetica")
            .text(
                "The applicant confirmed that the agreement was read and accepted."
            );

        doc.text(
            "The applicant confirmed that the submitted information is correct."
        );

        doc.text(
            "The applicant acknowledged the independent subcontractor requirements."
        );

        doc.text(
            "The applicant agreed to electronic signature."
        );

        doc.moveDown();
    }

    // ========================================================
    // SIGNATURE
    // ========================================================

    doc
        .fontSize(13)
        .font("Helvetica-Bold")
        .text(
            "Electronic Signature"
        );

    doc.moveDown(0.5);

    doc
        .fontSize(11)
        .font("Helvetica")
        .text(
            `Typed Signature: ${
                data.typedName || ""
            }`
        );

    doc.moveDown();

    const signatureBuffer =
        signatureDataUrlToBuffer(
            data.signature
        );

    if (signatureBuffer) {
        doc
            .fontSize(11)
            .font("Helvetica-Bold")
            .text(
                "Drawn Signature:"
            );

        doc.moveDown(0.5);

        try {
            doc.image(
                signatureBuffer,
                {
                    fit: [
                        300,
                        100
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Could not place signature in PDF:",
                error.message
            );
        }

        doc.moveDown();
    }

    // ========================================================
    // LEGAL NOTICE
    // ========================================================

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

    // ========================================================
    // FOOTER
    // ========================================================

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

    doc.end();

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

    return {
        fileName,
        filePath,
        fileUrl:
            `/contracts/${fileName}`
    };
}

// ============================================================
// SAVE CONTRACT
// ============================================================

function saveContract(
    data,
    fileUrl
) {
    const result =
        db.prepare(`
            INSERT INTO contracts
            (
                bookingId,
                name,
                email,
                phone,
                contractType,
                typedName,
                signature,
                pdfUrl,
                businessName,
                address,
                experience,
                services,
                availability,
                license,
                insurance,
                businessType,
                serviceArea,
                requirementsConfirmed,
                agreementAccepted,
                signedAt,
                approvalStatus
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `).run(
            data.bookingId || null,
            data.name,
            data.email,
            data.phone || null,
            data.contractType || null,
            data.typedName || null,
            data.signature || null,
            fileUrl,
            data.businessName || null,
            data.address || null,
            data.experience || null,
            Array.isArray(data.services)
                ? JSON.stringify(
                    data.services
                )
                : data.services || null,
            data.availability || null,
            data.license || null,
            data.insurance || null,
            data.businessType || null,
            data.serviceArea || null,
            data.requirementsConfirmed
                ? 1
                : 0,
            data.agreementAccepted
                ? 1
                : 0,
            data.signedAt ||
                new Date().toISOString(),
            "pending"
        );

    return result.lastInsertRowid;
}

// ============================================================
// NEW INDEPENDENT SUBCONTRACTOR AGREEMENT
// ============================================================

app.post(
    "/api/sign-contract",
    async (req, res) => {
        try {
            const data = {
                ...req.body
            };

            if (
                !data.name ||
                !data.email ||
                !data.phone ||
                !data.address ||
                !data.businessType ||
                !data.serviceArea ||
                !data.services ||
                !data.typedName ||
                !data.signature
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please complete all required fields."
                });
            }

            if (
                data.contractType !==
                "Independent Subcontractor Agreement"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid contract type."
                });
            }

            if (
                data.agreementAccepted !==
                true
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "You must accept the agreement."
                });
            }

            if (
                data.requirementsConfirmed !==
                true
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "You must confirm the subcontractor requirements."
                });
            }

            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (
                !emailRegex.test(
                    String(data.email).trim()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid email address."
                });
            }

            const signatureBuffer =
                signatureDataUrlToBuffer(
                    data.signature
                );

            if (!signatureBuffer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A valid drawn signature is required."
                });
            }

            const pdf =
                await createContractPdf(
                    data
                );

            const contractId =
                saveContract(
                    data,
                    pdf.fileUrl
                );

            // ------------------------------------------------
            // ADMIN NOTIFICATION
            // ------------------------------------------------

            await sendEmail({
                to: ADMIN_EMAIL,
                subject:
                    `New Independent Subcontractor Agreement #${contractId}`,
                html: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>New Independent Subcontractor Application</h2>

                        <p>
                            <strong>Contract ID:</strong>
                            ${contractId}
                        </p>

                        <p>
                            <strong>Name:</strong>
                            ${escapeHtml(data.name)}
                        </p>

                        <p>
                            <strong>Business:</strong>
                            ${escapeHtml(data.businessName)}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${escapeHtml(data.email)}
                        </p>

                        <p>
                            <strong>Phone:</strong>
                            ${escapeHtml(data.phone)}
                        </p>

                        <p>
                            <strong>Business Type:</strong>
                            ${escapeHtml(data.businessType)}
                        </p>

                        <p>
                            <strong>Service Area:</strong>
                            ${escapeHtml(data.serviceArea)}
                        </p>

                        <p>
                            <strong>Services:</strong>
                            ${escapeHtml(
                                formatServices(
                                    data.services
                                )
                            )}
                        </p>

                        <p>
                            <strong>Status:</strong>
                            Pending Review
                        </p>

                        <p>
                            <strong>Signed PDF:</strong>
                            ${FRONTEND_URL}${pdf.fileUrl}
                        </p>
                    </div>
                `
            });

            // ------------------------------------------------
            // APPLICANT CONFIRMATION
            // ------------------------------------------------

            await sendEmail({
                to: data.email,
                subject:
                    "My DMV Cleaning Services - Agreement Received",
                html: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>Agreement Received</h2>

                        <p>
                            Hello ${escapeHtml(data.name)},
                        </p>

                        <p>
                            Your Independent Subcontractor Agreement
                            has been successfully submitted to
                            My DMV Cleaning Services LLC.
                        </p>

                        <p>
                            <strong>Application ID:</strong>
                            ${contractId}
                        </p>

                        <p>
                            <strong>Status:</strong>
                            Pending Review
                        </p>

                        <p>
                            We will review your application and
                            contact you if additional information
                            is required.
                        </p>

                        <p>
                            Your signed document is available here:
                        </p>

                        <p>
                            <a href="${FRONTEND_URL}${pdf.fileUrl}">
                                View Signed Agreement
                            </a>
                        </p>
                    </div>
                `
            });

            console.log(
                "Independent Subcontractor Agreement created:",
                contractId
            );

            res.json({
                success: true,
                contractId,

                contract: {
                    id: contractId,
                    pdfUrl: pdf.fileUrl
                },

                file: pdf.fileUrl,

                message:
                    "Independent Subcontractor Agreement signed successfully and submitted for review."
            });

        } catch (error) {
            console.error(
                "SIGN CONTRACT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to create signed agreement."
            });
        }
    }
);

// ============================================================
// LEGACY CONTRACT ROUTE
// ============================================================

app.post(
    "/api/contracts",
    async (req, res) => {
        try {
            const data = {
                ...req.body
            };

            if (
                !data.name ||
                !data.email ||
                !data.typedName ||
                !data.signature
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email, typed signature, and drawn signature are required."
                });
            }

            const signatureBuffer =
                signatureDataUrlToBuffer(
                    data.signature
                );

            if (!signatureBuffer) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A valid PNG signature is required."
                });
            }

            const pdf =
                await createContractPdf(
                    data
                );

            const contractId =
                saveContract(
                    data,
                    pdf.fileUrl
                );

            await sendEmail({
                to: ADMIN_EMAIL,
                subject:
                    `Signed Contract #${contractId}`,
                html: `
                    <div style="font-family:Arial,sans-serif;line-height:1.6">
                        <h2>Signed Contract Submitted</h2>

                        <p>
                            <strong>Contract ID:</strong>
                            ${contractId}
                        </p>

                        <p>
                            <strong>Name:</strong>
                            ${escapeHtml(data.name)}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${escapeHtml(data.email)}
                        </p>

                        <p>
                            <strong>Contract Type:</strong>
                            ${escapeHtml(data.contractType)}
                        </p>

                        <p>
                            <a href="${FRONTEND_URL}${pdf.fileUrl}">
                                View Signed Contract
                            </a>
                        </p>
                    </div>
                `
            });

            res.json({
                success: true,
                contractId,
                file: pdf.fileUrl,
                contract: {
                    id: contractId,
                    pdfUrl: pdf.fileUrl
                },
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
            const contracts =
                db.prepare(`
                    SELECT *
                    FROM contracts
                    ORDER BY id DESC
                `).all();

            res.json({
                success: true,
                contracts
            });

        } catch (error) {
            console.error(
                "GET CONTRACTS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not load contracts"
            });
        }
    }
);

// ============================================================
// ADMIN GET ONE CONTRACT
// ============================================================

app.get(
    "/api/admin/contracts/:id",
    verifyAdmin,
    (req, res) => {
        try {
            const contract =
                db.prepare(`
                    SELECT *
                    FROM contracts
                    WHERE id = ?
                `).get(
                    req.params.id
                );

            if (!contract) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Contract not found"
                });
            }

            res.json({
                success: true,
                contract
            });

        } catch (error) {
            console.error(
                "GET CONTRACT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not load contract"
            });
        }
    }
);

// ============================================================
// ADMIN UPDATE CONTRACT STATUS
// ============================================================

app.put(
    "/api/admin/contracts/:id/status",
    verifyAdmin,
    (req, res) => {
        try {
            const allowedStatuses = [
                "pending",
                "approved",
                "rejected"
            ];

            const status =
                String(
                    req.body.status || ""
                ).trim();

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid contract status"
                });
            }

            const result =
                db.prepare(`
                    UPDATE contracts
                    SET approvalStatus = ?
                    WHERE id = ?
                `).run(
                    status,
                    req.params.id
                );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Contract not found"
                });
            }

            res.json({
                success: true,
                message:
                    "Contract status updated"
            });

        } catch (error) {
            console.error(
                "UPDATE CONTRACT STATUS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Could not update contract status"
            });
        }
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            success: true,
            status: "OK",
            service:
                "My DMV Cleaning Services LLC",
            stripeConfigured:
                Boolean(
                    process.env.STRIPE_SECRET_KEY
                ),
            emailConfigured:
                Boolean(
                    process.env.EMAIL_USER &&
                    process.env.EMAIL_PASS
                ),
            webhookConfigured:
                Boolean(
                    process.env.STRIPE_WEBHOOK_SECRET
                ),
            time:
                new Date().toISOString()
        });
    }
);

// ============================================================
// TEST API
// ============================================================

app.get(
    "/api/test",
    (req, res) => {
        res.json({
            success: true,
            message:
                "My DMV Cleaning Services API is working"
        });
    }
);

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
// 404
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
            "GLOBAL SERVER ERROR:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            success: false,
            message:
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
            "============================================================"
        );

        console.log(
            `My DMV Cleaning Services running on port ${PORT}`
        );

        console.log(
            `Local: http://127.0.0.1:${PORT}`
        );

        console.log(
            `Frontend: ${FRONTEND_URL}`
        );

        console.log(
            `Email: ${
                process.env.EMAIL_USER
                    ? "configured"
                    : "NOT configured"
            }`
        );

        console.log(
            `Stripe: ${
                process.env.STRIPE_SECRET_KEY
                    ? "configured"
                    : "NOT configured"
            }`
        );

        console.log(
            `Stripe Webhook: ${
                process.env.STRIPE_WEBHOOK_SECRET
                    ? "configured"
                    : "NOT configured"
            }`
        );

        console.log(
            "============================================================"
        );
    }
);
