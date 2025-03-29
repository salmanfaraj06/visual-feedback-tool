const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ images: {} }, null, 2));
}

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        // Create a unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        // Accept only images
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
}).single('imageFile'); // 'imageFile' is the name attribute of the input field in the HTML form

// --- Middleware ---
app.use(express.json()); // For parsing application/json
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS)
app.use('/uploads', express.static(UPLOADS_DIR)); // Serve uploaded images

// --- API Routes ---

// Get all image data (for listing uploaded images, maybe on an index page)
app.get('/api/images', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading data file:", err);
            return res.status(500).json({ message: 'Error reading image data' });
        }
        try {
            const jsonData = JSON.parse(data);
            // Return only the image IDs and original names, not full comment data
            const imageList = Object.keys(jsonData.images).map(id => ({
                id: id,
                originalName: jsonData.images[id].originalName,
                uploadTimestamp: jsonData.images[id].uploadTimestamp,
                filePath: jsonData.images[id].filePath // Send the path to display
            }));
            res.json(imageList);
        } catch (parseErr) {
            console.error("Error parsing data file:", parseErr);
            return res.status(500).json({ message: 'Error parsing image data' });
        }
    });
});


// Get comments for a specific image
app.get('/api/comments/:imageId', (req, res) => {
    const imageId = req.params.imageId;
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading data file' });
        }
        try {
            const jsonData = JSON.parse(data);
            if (!jsonData.images[imageId]) {
                return res.status(404).json({ message: 'Image not found' });
            }
            res.json(jsonData.images[imageId].comments || []);
        } catch (parseErr) {
            return res.status(500).json({ message: 'Error parsing data file' });
        }
    });
});

// Add a comment to a specific image
app.post('/api/comments/:imageId', (req, res) => {
    const imageId = req.params.imageId;
    const { x, y, text } = req.body;

    if (typeof x !== 'number' || typeof y !== 'number' || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ message: 'Invalid comment data (x, y, text required)' });
    }

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading data file' });
        }
        try {
            const jsonData = JSON.parse(data);
            if (!jsonData.images[imageId]) {
                return res.status(404).json({ message: 'Image not found' });
            }

            const newComment = {
                id: Date.now().toString(), // Simple unique ID
                x, // Percentage X
                y, // Percentage Y
                text: text.trim(),
                timestamp: new Date().toISOString()
            };

            jsonData.images[imageId].comments = jsonData.images[imageId].comments || [];
            jsonData.images[imageId].comments.push(newComment);

            fs.writeFile(DATA_FILE, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                if (writeErr) {
                    return res.status(500).json({ message: 'Error saving comment' });
                }
                res.status(201).json(newComment);
            });
        } catch (parseErr) {
            return res.status(500).json({ message: 'Error parsing data file' });
        }
    });
});

// Handle image upload
app.post('/api/upload', (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error("Multer error:", err);
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error("Unknown upload error:", err);
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        }

        // Everything went fine.
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        const imageId = path.basename(req.file.filename, path.extname(req.file.filename)); // Use filename without ext as ID
        const newImageData = {
            id: imageId,
            originalName: req.file.originalname,
            filePath: `/uploads/${req.file.filename}`, // Path relative to server root
            uploadTimestamp: new Date().toISOString(),
            comments: []
        };

        // Add image metadata to data.json
        fs.readFile(DATA_FILE, 'utf8', (readErr, data) => {
            if (readErr) {
                console.error("Error reading data file for upload:", readErr);
                // Attempt to clean up uploaded file if DB update fails
                fs.unlink(req.file.path, (unlinkErr) => {
                    if (unlinkErr) console.error("Error deleting orphaned upload:", unlinkErr);
                });
                return res.status(500).json({ message: 'Error processing upload (read)' });
            }
            try {
                const jsonData = JSON.parse(data);
                jsonData.images[imageId] = newImageData;

                fs.writeFile(DATA_FILE, JSON.stringify(jsonData, null, 2), 'utf8', (writeErr) => {
                    if (writeErr) {
                        console.error("Error writing data file for upload:", writeErr);
                        // Attempt to clean up uploaded file
                        fs.unlink(req.file.path, (unlinkErr) => {
                            if (unlinkErr) console.error("Error deleting orphaned upload:", unlinkErr);
                        });
                        return res.status(500).json({ message: 'Error processing upload (write)' });
                    }
                    // Send back the ID and path of the newly uploaded image
                    res.status(201).json({
                        message: 'File uploaded successfully!',
                        imageId: imageId,
                        filePath: newImageData.filePath
                     });
                });
            } catch (parseErr) {
                console.error("Error parsing data file for upload:", parseErr);
                 // Attempt to clean up uploaded file
                 fs.unlink(req.file.path, (unlinkErr) => {
                    if (unlinkErr) console.error("Error deleting orphaned upload:", unlinkErr);
                });
                return res.status(500).json({ message: 'Error processing upload (parse)' });
            }
        });
    });
});

// --- Serve the main page ---
// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the feedback page for a specific image
app.get('/feedback/:imageId', (req, res) => {
    // We can serve the same index.html and let the frontend JS handle fetching the correct image/comments
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`Visual Feedback Tool server listening at http://localhost:${port}`);
});