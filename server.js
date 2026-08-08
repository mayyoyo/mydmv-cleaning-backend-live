// ============================================================
// My DMV Cleaning Services LLC
// PRODUCTION SERVER
// ============================================================

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const Database = require("better-sqlite3");
const { Resend } = require("resend");

require("dotenv").config();

// ============================================================
// APP
// ============================================================

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.PORT || 5000;

const SECRET =
    process.env.JWT_SECRET || "change-this-secret";

const BACKEND_URL =
    process.env.BACKEND_URL ||
    "https://mydmv-cleaning-backend-live.onrender.com";

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://mydmvcleaningservice.com";

const ADMIN_USER =
    process.env.ADMIN_USER || "admin";

const ADMIN_PASS =
    process.env.ADMIN_PASS || "123456";

console.log("=================================");
console.log("🌐 FRONTEND:", FRONTEND_URL);
console.log("🔗 BACKEND:", BACKEND_URL);
console.log("=================================");

// ============================================================
// CORS
// ============================================================
app.use(
    cors({
        origin: [
            "https://mydmvcleaningservice.com",
            "https://www.mydmvcleaningservice.com",
            "http://localhost:5000",
            "http://127.0.0.1:5000"
        ],

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

// ============================================================
// BODY PARSING
// ============================================================

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
// 
// ============================================================
// BODY PARSING
// ============================================================

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
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {



    res.json({



        success: true,

        message: "Backend working",

        time: new Date().toISOString()

    });

});


// ============================================================
// STRIPE
// ============================================================

let stripe = null;
// 
// ============================================================
// STRIPE
// ============================================================

if (process.env.STRIPE_SECRET_KEY) {
    try {
        stripe = Stripe(
            process.env.STRIPE_SECRET_KEY
        );

        console.log("✅ Stripe initialized");
    } catch (error) {
        console.error(
            "❌ Stripe initialization error:",
            error.message
        );
    }
} else {
    console.error(
        "❌ STRIPE_SECRET_KEY is missing"
    );
}


// ============================================================
// RESEND EMAIL
// ============================================================

const resend = new Resend(
    process.env.RESEND_API_KEY
);

if (!process.env.RESEND_API_KEY) {
    console.error(
        "❌ RESEND_API_KEY is missing"
    );
} else {
    console.log(
        "✅ Resend API configured"
    );
}

// ============================================================
// DATABASE
// ============================================================

const db = new Database(
    path.join(__dirname, "database.db")
);

db.pragma("journal_mode = WAL");

console.log("✅ SQLite connected");

// ============================================================
// DIRECTORIES
// ============================================================

const folders = [
    "contracts",
    "invoices"
];

folders.forEach((folder) => {
    const directory = path.join(
        __dirname,
        folder
    );

    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {
            recursive: true
        });

        console.log(
            "📁 Created folder:",
            folder
        );
    }
});

// ============================================================
// DATABASE TABLES
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

        paymentType TEXT DEFAULT 'pay-later',

        status TEXT DEFAULT 'pending',

        stripeSession TEXT,

        stripePaymentIntent TEXT,

        createdAt TEXT

    );

    CREATE TABLE IF NOT EXISTS contracts (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        name TEXT,

        businessName TEXT,

        email TEXT,

        phone TEXT,

        address TEXT,

        contractType TEXT,

        experience TEXT,

        services TEXT,

        availability TEXT,

        license TEXT,

        insurance TEXT,

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
// DATABASE MIGRATION HELPER
// ============================================================

function addColumnIfMissing(
    table,
    column,
    definition
) {
    try {
        const columns = db
            .prepare(
                `PRAGMA table_info(${table})`
            )
            .all();

        const exists = columns.some(
            (item) => item.name === column
        );

        if (!exists) {
            db.exec(
                `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
            );

            console.log(
                `✅ Added ${table}.${column}`
            );
        }
    } catch (error) {
        console.error(
            `❌ Migration ${table}.${column}:`,
            error.message
        );
    }
}

// ============================================================
// BOOKING MIGRATIONS
// ============================================================

const bookingMigrations = [
    [
        "bookings",
        "phone",
        "TEXT DEFAULT ''"
    ],
    [
        "bookings",
        "address",
        "TEXT DEFAULT ''"
    ],
    [
        "bookings",
        "price",
        "REAL DEFAULT 0"
    ],
    [
        "bookings",
        "deposit",
        "REAL DEFAULT 0"
    ],
    [
        "bookings",
        "remaining",
        "REAL DEFAULT 0"
    ],
    [
        "bookings",
        "timeSlot",
        "TEXT DEFAULT ''"
    ],
    [
        "bookings",
        "paymentType",
        "TEXT DEFAULT 'pay-later'"
    ],
    [
        "bookings",
        "status",
        "TEXT DEFAULT 'pending'"
    ],
    [
        "bookings",
        "stripeSession",
        "TEXT"
    ],
    [
        "bookings",
        "stripePaymentIntent",
        "TEXT"
    ],
    [
        "bookings",
        "createdAt",
        "TEXT"
    ]
];

bookingMigrations.forEach((item) => {
    addColumnIfMissing(
        item[0],
        item[1],
        item[2]
    );
});

// ============================================================
// CONTRACT MIGRATIONS
// ============================================================

const contractMigrations = [
    [
        "contracts",
        "businessName",
        "TEXT"
    ],
    [
        "contracts",
        "address",
        "TEXT"
    ],
    [
        "contracts",
        "experience",
        "TEXT"
    ],
    [
        "contracts",
        "services",
        "TEXT"
    ],
    [
        "contracts",
        "availability",
        "TEXT"
    ],
    [
        "contracts",
        "license",
        "TEXT"
    ],
    [
        "contracts",
        "insurance",
        "TEXT"
    ],
    [
        "contracts",
        "typedName",
        "TEXT"
    ],
    [
        "contracts",
        "pdfUrl",
        "TEXT"
    ],
    [
        "contracts",
        "createdAt",
        "TEXT"
    ]
];

contractMigrations.forEach((item) => {
    addColumnIfMissing(
        item[0],
        item[1],
        item[2]
    );
});

console.log("✅ Database ready");

// ============================================================
// UNIQUE BOOKING SLOT PROTECTION
// ============================================================
//
// This prevents two active bookings from using the same
// date + time slot at the database level.
//
// Cancelled bookings do NOT block the slot.
//

try {
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        unique_active_booking_slot
        ON bookings(date, timeSlot)
        WHERE status != 'cancelled'
        AND timeSlot IS NOT NULL
        AND timeSlot != '';
    `);

    console.log(
        "✅ Database slot protection ready"
    );
} catch (error) {
    console.error(
        "⚠️ Could not create booking slot index:",
        error.message
    );
}

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
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return number;
}

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHTML(value) {
    return safeString(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// EMAIL FUNCTION - RESEND
// ============================================================

async function sendEmail({
    to,
    subject,
    html
}) {
    const recipient = safeString(to);

    if (!recipient) {
        throw new Error(
            "Email recipient is missing"
        );
    }

    if (!process.env.RESEND_API_KEY) {
        throw new Error(
            "RESEND_API_KEY is missing"
        );
    }

    console.log(
        "📧 Sending email with Resend to:",
        recipient
    );

    try {
        const result =
            await resend.emails.send({
                from:
                    "My DMV Cleaning Services LLC <onboarding@resend.dev>",

                to: recipient,

                replyTo:
                    process.env.EMAIL_USER ||
                    "mydmvcleaningservice@gmail.com",

                subject:
                    safeString(subject),

                html: html || ""
            });

        console.log(
            "✅ EMAIL SENT:",
            result
        );

        return result;

    } catch (error) {
        console.error(
            "❌ RESEND EMAIL ERROR:",
            error.message
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

    const token =
        authorization.startsWith("Bearer ")
            ? authorization
                .slice(7)
                .trim()
            : "";

    if (!token) {
        return res.status(401).json({
            success: false,
            error:
                "No authorization token"
        });
    }

    try {
        const decoded =
            jwt.verify(
                token,
                SECRET
            );

        if (
            !decoded ||
            decoded.role !== "admin"
        ) {
            return res.status(401).json({
                success: false,
                error:
                    "Invalid admin token"
            });
        }

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error:
                "Invalid token"
        });
    }
}

// ============================================================
// CHECK BOOKED SLOT
// ============================================================

function isTimeSlotBooked(
    date,
    timeSlot
) {
    const existing =
        db.prepare(`
            SELECT id
            FROM bookings
            WHERE date = ?
            AND timeSlot = ?
            AND status != 'cancelled'
            LIMIT 1
        `).get(
            date,
            timeSlot
        );

    return Boolean(existing);
}

// ============================================================
// GET BOOKED SLOTS FOR DATE
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
                    AND status != 'cancelled'
                    AND timeSlot IS NOT NULL
                    AND timeSlot != ''
                    ORDER BY timeSlot
                `).all(date);

            const bookedSlots =
                rows
                    .map(
                        (row) =>
                            safeString(
                                row.timeSlot
                            )
                    )
                    .filter(Boolean);

            console.log(
                "📅 Booked slots:",
                date,
                bookedSlots
            );

            return res.json(
                bookedSlots
            );
        } catch (error) {
            console.error(
                "❌ BOOKINGS BY DATE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to load booked times"
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

            let emailSent = false;

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
                            ${escapeHTML(name)}
                        </p>

                        <p>
                            <strong>Email:</strong>
                            ${escapeHTML(email)}
                        </p>

                        <p>
                            <strong>Phone:</strong>
                            ${escapeHTML(
                                phone ||
                                "Not provided"
                            )}
                        </p>

                        <p>
                            <strong>Message:</strong>
                        </p>

                        <p>
                            ${escapeHTML(message)}
                        </p>
                    `
                });

                emailSent = true;
            } catch (emailError) {
                console.error(
                    "❌ CONTACT EMAIL FAILED:",
                    emailError.message
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
// GET BOOKING
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
                    success: false,
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
                `).get(id);

            if (!booking) {
                return res.status(404).json({
                    success: false,
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
                success: false,
                error:
                    "Unable to load booking"
            });
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
                    success: false,
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
                `).get(sessionId);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Booking not found"
                });
            }

            return res.json(
                booking
            );
        } catch (error) {
            console.error(
                "❌ GET BOOKING BY SESSION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    "Server error"
            });
        }
    }
);

// ============================================================
// VERIFY STRIPE SESSION
// ============================================================

app.get(
    "/api/verify-stripe-session/:sessionId",
    async (req, res) => {
        try {
            if (!stripe) {
                return res.status(500).json({
                    success: false,
                    error:
                        "Stripe is not configured"
                });
            }

            const sessionId =
                safeString(
                    req.params.sessionId
                );

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Stripe session ID is required"
                });
            }

            const session =
                await stripe.checkout.sessions.retrieve(
                    sessionId
                );

            const booking =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    WHERE stripeSession = ?
                    LIMIT 1
                `).get(sessionId);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Booking not found"
                });
            }

            if (
                session.payment_status ===
                "paid"
            ) {
                db.prepare(`
                    UPDATE bookings
                    SET
                        status = 'deposit-paid',
                        stripePaymentIntent = ?
                    WHERE id = ?
                `).run(
                    session.payment_intent
                        ? String(
                            session.payment_intent
                        )
                        : null,

                    booking.id
                );
            }

            const updatedBooking =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    WHERE id = ?
                `).get(
                    booking.id
                );

            return res.json({
                success: true,

                paymentStatus:
                    session.payment_status,

                booking:
                    updatedBooking
            });
        } catch (error) {
            console.error(
                "❌ STRIPE VERIFICATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to verify Stripe payment"
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

    return sendEmail({
        to:
            safeString(
                booking.email
            ),

        subject:
            "Booking Confirmation - My DMV Cleaning Services LLC",

        html: `
            <div
                style="
                    font-family:Arial,sans-serif;
                    max-width:650px;
                    margin:auto;
                    line-height:1.6;
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
                    <strong>
                        ${escapeHTML(
                            booking.name
                        )}
                    </strong>.
                </p>

                <p>
                    Your cleaning appointment has been successfully received.
                </p>

                <hr>

                <p>
                    <strong>Service:</strong>
                    ${escapeHTML(
                        booking.service
                    )}
                </p>

                <p>
                    <strong>Date:</strong>
                    ${escapeHTML(
                        booking.date
                    )}
                </p>

                <p>
                    <strong>Time:</strong>
                    ${escapeHTML(
                        booking.timeSlot
                    )}
                </p>

                <p>
                    <strong>Phone:</strong>
                    ${escapeHTML(
                        booking.phone ||
                        "Not provided"
                    )}
                </p>

                <p>
                    <strong>Address:</strong>
                    ${escapeHTML(
                        booking.address ||
                        "Not provided"
                    )}
                </p>

                <hr>

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
// VALIDATE BOOKING
// ============================================================

function validateBooking(req) {
    const booking = {
        name:
            safeString(
                req.body.name
            ),

        email:
            safeString(
                req.body.email
            ),

        phone:
            safeString(
                req.body.phone
            ),

        address:
            safeString(
                req.body.address
            ),

        service:
            safeString(
                req.body.service
            ),

        date:
            safeString(
                req.body.date
            ),

        timeSlot:
            safeString(
                req.body.timeSlot
            ),

        price:
            safeNumber(
                req.body.price
            )
    };

    if (!booking.name) {
        return [
            "Name is required",
            booking
        ];
    }

    if (!booking.email) {
        return [
            "Email is required",
            booking
        ];
    }

    if (!booking.service) {
        return [
            "Service is required",
            booking
        ];
    }

    if (!booking.date) {
        return [
            "Date is required",
            booking
        ];
    }

    if (!booking.timeSlot) {
        return [
            "Time slot is required",
            booking
        ];
    }

    if (booking.price <= 0) {
        return [
            "A valid price is required",
            booking
        ];
    }

    return [
        null,
        booking
    ];
}

// ============================================================
// PAY LATER BOOKING
// ============================================================

app.post(
    "/api/book-pay-later",
    async (req, res) => {
        try {
            const [
                validationError,
                booking
            ] =
                validateBooking(req);

            if (validationError) {
                return res.status(400).json({
                    success: false,
                    error:
                        validationError
                });
            }

            // ------------------------------------------------
            // CHECK SLOT
            // ------------------------------------------------

            if (
                isTimeSlotBooked(
                    booking.date,
                    booking.timeSlot
                )
            ) {
                return res.status(409).json({
                    success: false,
                    error:
                        "This time slot is already booked. Please choose another time."
                });
            }

            let bookingId;

            try {
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
                            status,
                            stripeSession,
                            stripePaymentIntent,
                            createdAt
                        )
                        VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        booking.name,
                        booking.email,
                        booking.phone,
                        booking.address,
                        booking.service,
                        booking.price,
                        0,
                        booking.price,
                        booking.date,
                        booking.timeSlot,
                        "pay-later",
                        "pending",
                        null,
                        null,
                        new Date().toISOString()
                    );

                bookingId =
                    Number(
                        result.lastInsertRowid
                    );
            } catch (insertError) {
                if (
                    insertError.code ===
                    "SQLITE_CONSTRAINT_UNIQUE"
                ) {
                    return res.status(409).json({
                        success: false,
                        error:
                            "This time slot is already booked. Please choose another time."
                    });
                }

                throw insertError;
            }

            let emailSent = false;

            try {
                await sendBookingEmail({
                    ...booking,

                    deposit: 0,

                    remaining:
                        booking.price
                });

                emailSent = true;
            } catch (emailError) {
                console.error(
                    "❌ PAY LATER EMAIL FAILED:",
                    emailError.message
                );
            }

            return res.json({
                success: true,

                bookingId,

                emailSent,

                redirectUrl:
                    `${FRONTEND_URL}/success.html?booking_id=${encodeURIComponent(
                        bookingId
                    )}`,

                message:
                    "Booking created successfully"
            });
        } catch (error) {
            console.error(
                "❌ PAY LATER ERROR:",
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
// STRIPE 25% DEPOSIT CHECKOUT
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

            const [
                validationError,
                booking
            ] =
                validateBooking(req);

            if (validationError) {
                return res.status(400).json({
                    success: false,
                    error:
                        validationError
                });
            }

            // ------------------------------------------------
            // CHECK SLOT
            // ------------------------------------------------

            if (
                isTimeSlotBooked(
                    booking.date,
                    booking.timeSlot
                )
            ) {
                return res.status(409).json({
                    success: false,
                    error:
                        "This time slot is already booked. Please choose another time."
                });
            }

            // ------------------------------------------------
            // 25% DEPOSIT
            // ------------------------------------------------

            const deposit =
                Math.round(
                    booking.price *
                    0.25 *
                    100
                ) / 100;

            const remaining =
                Math.round(
                    (
                        booking.price -
                        deposit
                    ) *
                    100
                ) / 100;

            // ------------------------------------------------
            // STRIPE CHECKOUT
            // ------------------------------------------------

            const session =
                await stripe.checkout.sessions.create({
                    mode: "payment",

                    payment_method_types: [
                        "card"
                    ],

                    customer_email:
                        booking.email,

                    metadata: {
                        name:
                            booking.name,

                        email:
                            booking.email,

                        phone:
                            booking.phone,

                        address:
                            booking.address,

                        service:
                            booking.service,

                        date:
                            booking.date,

                        timeSlot:
                            booking.timeSlot,

                        total:
                            String(
                                booking.price
                            )
                    },

                    line_items: [
                        {
                            price_data: {
                                currency:
                                    "usd",

                                product_data: {
                                    name:
                                        `${booking.service} - 25% Deposit`
                                },

                                unit_amount:
                                    Math.round(
                                        deposit *
                                        100
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

            let bookingId;

            try {
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
                            status,
                            stripeSession,
                            stripePaymentIntent,
                            createdAt
                        )
                        VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        booking.name,
                        booking.email,
                        booking.phone,
                        booking.address,
                        booking.service,
                        booking.price,
                        deposit,
                        remaining,
                        booking.date,
                        booking.timeSlot,
                        "stripe-deposit",
                        "payment-pending",
                        session.id,
                        null,
                        new Date().toISOString()
                    );

                bookingId =
                    Number(
                        result.lastInsertRowid
                    );
            } catch (insertError) {
                if (
                    insertError.code ===
                    "SQLITE_CONSTRAINT_UNIQUE"
                ) {
                    // Customer could have reached Stripe while
                    // another booking took the slot.
                    try {
                        await stripe.checkout.sessions.expire(
                            session.id
                        );
                    } catch (expireError) {
                        console.error(
                            "⚠️ Could not expire Stripe session:",
                            expireError.message
                        );
                    }

                    return res.status(409).json({
                        success: false,
                        error:
                            "This time slot was just booked by another customer. Please choose another time."
                    });
                }

                throw insertError;
            }

            console.log(
                "✅ Stripe session:",
                session.id
            );

            console.log(
                "📋 Booking ID:",
                bookingId
            );

            return res.json({
                success: true,

                bookingId,

                sessionId:
                    session.id,

                url:
                    session.url
            });
        } catch (error) {
            console.error(
                "❌ STRIPE ERROR:",
                error
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
// CHARGE REMAINING BALANCE
// ============================================================

app.post(
    "/api/charge-later/:id",
    verifyAdmin,
    async (req, res) => {
        try {
            if (!stripe) {
                return res.status(500).json({
                    success: false,
                    error:
                        "Stripe is not configured"
                });
            }

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

            const booking =
                db.prepare(`
                    SELECT *
                    FROM bookings
                    WHERE id = ?
                    LIMIT 1
                `).get(id);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Booking not found"
                });
            }

            const remaining =
                safeNumber(
                    booking.remaining
                );

            if (remaining <= 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        "No remaining balance"
                });
            }

            if (!booking.email) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Customer email is missing"
                });
            }

            const paymentIntent =
                await stripe.paymentIntents.create({
                    amount:
                        Math.round(
                            remaining *
                            100
                        ),

                    currency:
                        "usd",

                    receipt_email:
                        booking.email,

                    description:
                        `${booking.service} - Remaining Balance`,

                    metadata: {
                        bookingId:
                            String(
                                booking.id
                            ),

                        customer:
                            booking.name
                    }
                });

            if (
                paymentIntent.status !==
                "succeeded"
            ) {
                return res.status(400).json({
                    success: false,

                    error:
                        `Payment was not completed. Stripe status: ${paymentIntent.status}`,

                    paymentIntentId:
                        paymentIntent.id
                });
            }

            db.prepare(`
                UPDATE bookings
                SET
                    remaining = 0,
                    status = 'paid',
                    stripePaymentIntent = ?
                WHERE id = ?
            `).run(
                paymentIntent.id,
                booking.id
            );

            return res.json({
                success: true,

                bookingId:
                    booking.id,

                paymentIntentId:
                    paymentIntent.id,

                message:
                    "Remaining balance charged successfully"
            });
        } catch (error) {
            console.error(
                "❌ CHARGE LATER ERROR:",
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
                    !fs.existsSync(folder)
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
                        size: "LETTER",
                        margin: 55
                    });

                const stream =
                    fs.createWriteStream(
                        filepath
                    );

                doc.pipe(stream);

                const name =
                    safeString(
                        contract.name
                    );

                const businessName =
                    safeString(
                        contract.businessName
                    );

                const email =
                    safeString(
                        contract.email
                    );

                const phone =
                    safeString(
                        contract.phone
                    );

                const address =
                    safeString(
                        contract.address
                    );

                const contractType =
                    safeString(
                        contract.contractType
                    ) ||
                    "Client Service Agreement";

                const experience =
                    safeString(
                        contract.experience
                    );

                const services =
                    Array.isArray(
                        contract.services
                    )
                        ? contract.services
                            .map(safeString)
                            .filter(Boolean)
                            .join(", ")
                        : safeString(
                            contract.services
                        );

                const availability =
                    safeString(
                        contract.availability
                    );

                const license =
                    safeString(
                        contract.license
                    );

                const insurance =
                    safeString(
                        contract.insurance
                    );

                const typedName =
                    safeString(
                        contract.typedName
                    );

                const serviceDescription =
                    safeString(
                        contract.serviceDescription
                    );

                const jobDescription =
                    safeString(
                        contract.jobDescription
                    );

                const completionNotes =
                    safeString(
                        contract.completionNotes
                    );

                // ------------------------------------------------
                // HEADER
                // ------------------------------------------------

                doc
                    .fontSize(20)
                    .font("Helvetica-Bold")
                    .fillColor("#000000")
                    .text(
                        "My DMV Cleaning Services LLC",
                        {
                            align: "center"
                        }
                    );

                doc.moveDown(0.5);

                doc
                    .fontSize(12)
                    .font("Helvetica")
                    .text(
                        "Cleaning Services",
                        {
                            align: "center"
                        }
                    );

                doc.moveDown();

                doc
                    .fontSize(17)
                    .font("Helvetica-Bold")
                    .text(
                        contractType,
                        {
                            align: "center"
                        }
                    );

                doc.moveDown(1.5);

                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .text(
                        "Document Date: " +
                        new Date()
                            .toLocaleDateString()
                    );

                doc.moveDown();

                // ------------------------------------------------
                // PARTY INFORMATION
                // ------------------------------------------------

                doc
                    .fontSize(13)
                    .font("Helvetica-Bold")
                    .text(
                        "PARTY INFORMATION"
                    );

                doc.moveDown(0.5);

                doc
                    .fontSize(10.5)
                    .font("Helvetica");

                doc.text(
                    "Full Name: " +
                    (
                        name ||
                        "Not provided"
                    )
                );

                if (businessName) {
                    doc.text(
                        "Business Name: " +
                        businessName
                    );
                }

                doc.text(
                    "Email: " +
                    (
                        email ||
                        "Not provided"
                    )
                );

                doc.text(
                    "Phone: " +
                    (
                        phone ||
                        "Not provided"
                    )
                );

                if (address) {
                    doc.text(
                        "Address: " +
                        address
                    );
                }

                doc.moveDown();

                // ------------------------------------------------
                // INDEPENDENT CONTRACTOR
                // ------------------------------------------------

                if (
                    contractType ===
                    "Independent Contractor Agreement"
                ) {
                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "INDEPENDENT CONTRACTOR INFORMATION"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "Years of Experience: " +
                        (
                            experience ||
                            "Not provided"
                        )
                    );

                    doc.text(
                        "Services Offered: " +
                        (
                            services ||
                            "Not provided"
                        )
                    );

                    doc.text(
                        "Availability: " +
                        (
                            availability ||
                            "Not provided"
                        )
                    );

                    doc.text(
                        "License / Certification: " +
                        (
                            license ||
                            "Not provided"
                        )
                    );

                    doc.text(
                        "Insurance Information: " +
                        (
                            insurance ||
                            "Not provided"
                        )
                    );

                    doc.moveDown();

                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "AGREEMENT TERMS"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "1. Independent Contractor Relationship"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The contractor acknowledges that the relationship " +
                        "with My DMV Cleaning Services LLC is intended to be " +
                        "an independent contractor relationship and not an " +
                        "employer-employee relationship. The contractor is " +
                        "responsible for complying with applicable laws and " +
                        "requirements relating to their independent business."
                    );

                    doc.moveDown();

                    doc.text(
                        "2. Services"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The contractor agrees to perform the cleaning " +
                        "services that are accepted or assigned according " +
                        "to the agreed service requirements. Services should " +
                        "be performed professionally, safely, and with " +
                        "reasonable care."
                    );

                    doc.moveDown();

                    doc.text(
                        "3. Equipment and Supplies"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "Unless otherwise agreed in writing, the contractor " +
                        "is responsible for maintaining the equipment, " +
                        "cleaning supplies, transportation, and other items " +
                        "necessary to perform accepted services."
                    );

                    doc.moveDown();

                    doc.text(
                        "4. Qualifications and Insurance"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The contractor is responsible for providing accurate " +
                        "information regarding experience, qualifications, " +
                        "licenses, certifications, and insurance."
                    );

                    doc.moveDown();

                    doc.text(
                        "5. Professional Conduct"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The contractor agrees to conduct themselves " +
                        "professionally, respect customers and their property, " +
                        "protect customer information, and promptly report " +
                        "any damage, safety concern, scheduling issue, or " +
                        "other significant problem."
                    );

                    doc.moveDown();

                    doc.text(
                        "6. Confidentiality and Customer Privacy"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The contractor should protect confidential customer " +
                        "information and should not improperly disclose, copy, " +
                        "use, or distribute customer information obtained " +
                        "through the service relationship."
                    );
                }

                // ------------------------------------------------
                // CLIENT SERVICE AGREEMENT
                // ------------------------------------------------

                else if (
                    contractType ===
                    "Client Service Agreement"
                ) {
                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "CLIENT SERVICE INFORMATION"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "Service Address: " +
                        (
                            address ||
                            "Not provided"
                        )
                    );

                    doc.moveDown(0.5);

                    doc.text(
                        "Requested Services:"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        serviceDescription ||
                        "Not provided"
                    );

                    doc.moveDown();

                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "SERVICE AGREEMENT TERMS"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "1. Services"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "My DMV Cleaning Services LLC agrees to provide " +
                        "the cleaning services selected or otherwise agreed " +
                        "upon by the parties. The scope of work may depend " +
                        "on the condition, size, accessibility, and specific " +
                        "requirements of the property."
                    );

                    doc.moveDown();

                    doc.text(
                        "2. Customer Responsibilities"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The customer agrees to provide accurate information " +
                        "about the property and requested services and to " +
                        "provide reasonable access to the areas that need " +
                        "to be cleaned."
                    );

                    doc.moveDown();

                    doc.text(
                        "3. Special Requests"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "Additional services or special requests may require " +
                        "additional charges or a separate agreement before " +
                        "the work is performed."
                    );

                    doc.moveDown();

                    doc.text(
                        "4. Payment"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The customer agrees to pay the applicable service " +
                        "charges according to the pricing and payment terms " +
                        "provided by My DMV Cleaning Services LLC."
                    );

                    doc.moveDown();

                    doc.text(
                        "5. Property and Safety"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The customer should identify fragile items, special " +
                        "surfaces, hazards, pets, access restrictions, or " +
                        "other conditions that may affect the cleaning service."
                    );

                    doc.moveDown();

                    doc.text(
                        "6. Service Changes"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "Changes to the requested service, property condition, " +
                        "or scope of work may require changes to the scheduled " +
                        "service or price."
                    );
                }

                // ------------------------------------------------
                // NON-BINDING AGREEMENT
                // ------------------------------------------------

                else if (
                    contractType ===
                    "Non-Binding Agreement"
                ) {
                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "NON-BINDING UNDERSTANDING"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "Purpose"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "This document records the current understanding, " +
                        "intentions, or discussions between the parties " +
                        "regarding potential cleaning services."
                    );

                    doc.moveDown();

                    doc.text(
                        "Non-Binding Nature"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "Unless the parties separately enter into a written " +
                        "agreement that states otherwise, this document is " +
                        "intended to be non-binding and does not by itself " +
                        "create an obligation for either party to purchase, " +
                        "provide, or continue cleaning services."
                    );

                    doc.moveDown();

                    doc.text(
                        "Future Agreement"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        "The parties may later enter into a separate service " +
                        "agreement, contractor agreement, booking arrangement, " +
                        "or other written agreement containing binding terms."
                    );
                }

                // ------------------------------------------------
                // JOB COMPLETION
                // ------------------------------------------------

                else if (
                    contractType ===
                    "Job Completion Form"
                ) {
                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "JOB COMPLETION INFORMATION"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "Service Address: " +
                        (
                            address ||
                            "Not provided"
                        )
                    );

                    doc.moveDown(0.5);

                    doc.text(
                        "Work Completed:"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        jobDescription ||
                        serviceDescription ||
                        "Not provided"
                    );

                    doc.moveDown();

                    doc.text(
                        "Completion Notes:"
                    );

                    doc.moveDown(0.25);

                    doc.text(
                        completionNotes ||
                        "No additional notes provided."
                    );

                    doc.moveDown();

                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "COMPLETION ACKNOWLEDGMENT"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "The information above is intended to document the " +
                        "cleaning work reported as completed for the customer " +
                        "and property identified in this form."
                    );
                }

                // ------------------------------------------------
                // FALLBACK
                // ------------------------------------------------

                else {
                    doc
                        .fontSize(13)
                        .font("Helvetica-Bold")
                        .text(
                            "SERVICE DOCUMENT"
                        );

                    doc.moveDown(0.5);

                    doc
                        .fontSize(10.5)
                        .font("Helvetica");

                    doc.text(
                        "This document records the service relationship " +
                        "and information provided by the parties."
                    );
                }

                // ------------------------------------------------
                // SIGNATURE
                // ------------------------------------------------

                doc.moveDown(2);

                doc
                    .fontSize(13)
                    .font("Helvetica-Bold")
                    .text(
                        "SIGNATURE"
                    );

                doc.moveDown(0.5);

                doc
                    .fontSize(10.5)
                    .font("Helvetica")
                    .text(
                        "Typed Signature:"
                    );

                doc.moveDown(0.5);

                doc.text(
                    typedName ||
                    "Not provided"
                );

                doc.moveDown();

                // ------------------------------------------------
                // DRAWN SIGNATURE
                // ------------------------------------------------

                if (
                    contract.signature &&
                    typeof contract.signature ===
                        "string"
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
                                "_" +
                                Math.random()
                                    .toString(36)
                                    .substring(2, 7) +
                                ".png"
                            );

                        fs.writeFileSync(
                            signatureFile,
                            base64,
                            "base64"
                        );

                        doc.text(
                            "Drawn Signature:"
                        );

                        doc.moveDown(0.5);

                        doc.image(
                            signatureFile,
                            {
                                width: 180
                            }
                        );

                        doc.moveDown();

                        try {
                            fs.unlinkSync(
                                signatureFile
                            );
                        } catch (
                            cleanupError
                        ) {
                            console.error(
                                "⚠️ Signature cleanup error:",
                                cleanupError.message
                            );
                        }
                    } catch (
                        signatureError
                    ) {
                        console.error(
                            "❌ Signature image error:",
                            signatureError.message
                        );
                    }
                }

                // ------------------------------------------------
                // SIGNED DATE
                // ------------------------------------------------

                doc.moveDown();

                doc
                    .fontSize(10.5)
                    .font("Helvetica")
                    .text(
                        "Date Signed: " +
                        new Date()
                            .toLocaleDateString()
                    );

                doc.moveDown(2);

                // ------------------------------------------------
                // FOOTER
                // ------------------------------------------------

                doc
                    .fontSize(9)
                    .fillColor("#555555")
                    .text(
                        "My DMV Cleaning Services LLC",
                        {
                            align: "center"
                        }
                    );

                doc.text(
                    "703-967-0674",
                    {
                        align: "center"
                    }
                );

                doc.text(
                    "This document was electronically signed.",
                    {
                        align: "center"
                    }
                );

                // ------------------------------------------------
                // FINISH
                // ------------------------------------------------

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

                        reject(error);
                    }
                );
            } catch (error) {
                console.error(
                    "❌ PDF CREATION ERROR:",
                    error
                );

                reject(error);
            }
        }
    );
}

// ============================================================
// CONTRACT HANDLER
// ============================================================

async function handleSignContract(
    req,
    res
) {
    try {
        const name =
            safeString(
                req.body.name
            );

        const businessName =
            safeString(
                req.body.businessName
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

        const contractType =
            safeString(
                req.body.contractType
            ) ||
            "Client Service Agreement";

        const experience =
            safeString(
                req.body.experience
            );

        const availability =
            safeString(
                req.body.availability
            );

        const license =
            safeString(
                req.body.license
            );

        const insurance =
            safeString(
                req.body.insurance
            );

        const serviceDescription =
            safeString(
                req.body.serviceDescription
            );

        const jobDescription =
            safeString(
                req.body.jobDescription
            );

        const completionNotes =
            safeString(
                req.body.completionNotes
            );

        const typedName =
            safeString(
                req.body.typedName
            );

        const signature =
            req.body.signature || "";

        let services = [];

        if (
            Array.isArray(
                req.body.services
            )
        ) {
            services =
                req.body.services
                    .map(safeString)
                    .filter(Boolean);
        } else if (
            req.body.services
        ) {
            services = [
                safeString(
                    req.body.services
                )
            ];
        }

        // ------------------------------------------------
        // VALIDATION
        // ------------------------------------------------

        if (!name) {
            return res.status(400).json({
                success: false,
                error:
                    "Full name is required"
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
                    "Typed signature is required"
            });
        }

        // ------------------------------------------------
        // CREATE PDF
        // ------------------------------------------------

        const pdfUrl =
            await createContractPDF({
                name,
                businessName,
                email,
                phone,
                address,
                contractType,
                experience,
                services,
                availability,
                license,
                insurance,
                typedName,
                signature,
                serviceDescription,
                jobDescription,
                completionNotes
            });

        // ------------------------------------------------
        // SAVE CONTRACT
        // ------------------------------------------------

        const result =
            db.prepare(`
                INSERT INTO contracts
                (
                    name,
                    businessName,
                    email,
                    phone,
                    address,
                    contractType,
                    experience,
                    services,
                    availability,
                    license,
                    insurance,
                    typedName,
                    pdfUrl,
                    createdAt
                )
                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                name,
                businessName,
                email,
                phone,
                address,
                contractType,
                experience,
                JSON.stringify(
                    services
                ),
                availability,
                license,
                insurance,
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

        // ------------------------------------------------
        // EMAIL CONTRACT
        // ------------------------------------------------

        let emailSent = false;

        try {
            await sendEmail({
                to: email,

                subject:
                    `${contractType} - My DMV Cleaning Services LLC`,

                html: `
                    <h2>
                        🧼 My DMV Cleaning Services LLC
                    </h2>

                    <h3>
                        ${escapeHTML(
                            contractType
                        )}
                    </h3>

                    <p>
                        Hello
                        <strong>
                            ${escapeHTML(
                                name
                            )}
                        </strong>,
                    </p>

                    <p>
                        Your signed document has been
                        created successfully.
                    </p>

                    <p>
                        <a
                            href="${publicPdfUrl}"
                            target="_blank"
                        >
                            📄 View Signed PDF
                        </a>
                    </p>

                    <p>
                        My DMV Cleaning Services LLC
                        <br>
                        📞 703-967-0674
                    </p>
                `
            });

            emailSent = true;
        } catch (emailError) {
            console.error(
                "❌ CONTRACT EMAIL FAILED:",
                emailError.message
            );
        }

        return res.json({
            success: true,

            contractId,

            pdf:
                publicPdfUrl,

            pdfUrl:
                publicPdfUrl,

            emailSent,

            message:
                "Contract signed and PDF created successfully"
        });
    } catch (error) {
        console.error(
            "❌ CONTRACT API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Unable to create contract"
        });
    }
}

// ============================================================
// CONTRACT ROUTES
// ============================================================

app.post(
    "/api/sign-contract",
    handleSignContract
);

app.post(
    "/api/contracts",
    handleSignContract
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
                        role: "admin"
                    },

                    SECRET,

                    {
                        expiresIn: "2h"
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

            return res.json(rows);
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
                `).run(id);

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
// ADMIN CONTACTS
// ============================================================

app.get(
    "/api/admin/contacts",
    verifyAdmin,
    (req, res) => {
        try {
            const rows =
                db.prepare(`
                    SELECT *
                    FROM contacts
                    ORDER BY id DESC
                `).all();

            return res.json(rows);
        } catch (error) {
            console.error(
                "❌ ADMIN CONTACT ERROR:",
                error
            );

            return res.status(500).json([]);
        }
    }
);

// ============================================================
// DELETE CONTACT
// ============================================================

app.delete(
    "/api/admin/contacts/:id",
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
                        "Invalid contact ID"
                });
            }

            const result =
                db.prepare(`
                    DELETE FROM contacts
                    WHERE id = ?
                `).run(id);

            if (
                result.changes === 0
            ) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Contact not found"
                });
            }

            return res.json({
                success: true
            });
        } catch (error) {
            console.error(
                "❌ DELETE CONTACT ERROR:",
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

            return res.json(rows);
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
                `).get(id);

            const result =
                db.prepare(`
                    DELETE FROM contracts
                    WHERE id = ?
                `).run(id);

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
// PUBLIC CONTRACT PDFs
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
// PUBLIC INVOICE PDFs
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
// FRONTEND
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
// ROOT
// ============================================================

app.get(
    "/",
    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

// ============================================================
// API TEST
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
                Boolean(stripe),

            email:
                Boolean(
                    process.env.EMAIL_USER &&
                    process.env.EMAIL_PASS
                ),

            sqlite:
                true,

            bookedSlotBlocking:
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
            status: "ok",

            service:
                "My DMV Cleaning Services LLC",

            time:
                new Date().toISOString()
        });
    }
);

// ============================================================
// 404 HANDLER
// ============================================================

app.use(
    (req, res) => {
        console.error(
            "❌ 404:",
            req.method,
            req.originalUrl
        );

        return res.status(404).json({
            success: false,

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

        console.error(error);

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
"0.0.0.0",
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
            "📅 Booked Slot Blocking: READY"
        );

        console.log(
            "📄 Contract PDFs: READY"
        );

        console.log(
            "📝 Contract API: READY"
        );

        console.log(
            "================================="
        );
    }
);