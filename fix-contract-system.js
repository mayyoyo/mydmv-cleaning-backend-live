const fs = require("fs");

const p = "server.js";
let s = fs.readFileSync(p, "utf8");

const oldTable = `db.prepare(\`

CREATE TABLE IF NOT EXISTS contracts (

id INTEGER PRIMARY KEY AUTOINCREMENT,

bookingId INTEGER,

name TEXT,

email TEXT,

file TEXT,

createdAt DATETIME DEFAULT CURRENT_TIMESTAMP

)

\`).run();`;

const newTable = `db.prepare(\`

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

\`).run();`;

if (s.includes(oldTable)) {
    s = s.replace(oldTable, newTable);
    console.log("SUCCESS: contracts table definition updated");
} else {
    console.log("NOTICE: contracts table definition already changed or formatting differs");
}

const insertStart = `const result =
                db.prepare(\`
                    INSERT INTO contracts
                    (
                        bookingId,
                        name,
                        email,
                        pdfUrl
                    )
                    VALUES (?, ?, ?, ?)
                \`).run(

                    null,

                    name,

                    email,

                    fileUrl

                );`;

const insertNew = `const result =
                db.prepare(\`
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
                        insurance
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                \`).run(

                    null,
                    name,
                    email,
                    phone || null,
                    contractType || null,
                    typedName || null,
                    signature || null,
                    fileUrl,
                    businessName || null,
                    address || null,
                    experience || null,
                    Array.isArray(services)
                        ? JSON.stringify(services)
                        : services || null,
                    availability || null,
                    license || null,
                    insurance || null

                );`;

if (!s.includes(insertStart)) {
    console.error("ERROR: old contract INSERT block was not found");
    process.exit(1);
}

s = s.replace(insertStart, insertNew);

fs.writeFileSync(p, s, "utf8");

console.log("SUCCESS: contract database INSERT fixed");
console.log("SUCCESS: server.js updated");
