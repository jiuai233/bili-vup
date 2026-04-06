const mysqldump = require('mysqldump');
require('dotenv').config({ path: './.env' });

mysqldump({
    connection: {
        host: '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        database: process.env.DB_NAME || 'bilibili_data',
    },
    dumpToFile: '../local_bilibili_data.sql',
}).then(() => {
    console.log("SQL Database Dumped Successfully!");
}).catch(err => {
    console.error("Dump failed:", err);
});
