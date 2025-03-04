const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Enable CORS
app.use(cors());

// Serve static files (frontend)
app.use(express.static('Public'));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Parse CSV file
    const rows = fileContent.split('\n').filter(row => row.trim() !== ''); // Skip empty lines
    
    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    const headers = rows[0].split(',').map(header => header.trim());
    
    if (headers.length === 0) {
      throw new Error('CSV file has no headers');
    }
    
    const data = rows.slice(1).map(row => {
      const values = row.split(',');
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index]?.trim() || '';
        return obj;
      }, {});
    });

    // Remove duplicates
    const cleanedData = removeDuplicates(data);

    // Save cleaned data to a new CSV file
    const cleanedCsv = convertToCsv(cleanedData, headers);
    const outputFilePath = path.join(__dirname, 'uploads', `cleaned_${req.file.originalname}`);
    fs.writeFileSync(outputFilePath, cleanedCsv);

    // Send cleaned file back to the frontend
    res.download(outputFilePath, `cleaned_${req.file.originalname}`, () => {
      // Clean up uploaded and cleaned files
      fs.unlinkSync(filePath);
      fs.unlinkSync(outputFilePath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to remove duplicates based on the column named 'Number' only
function removeDuplicates(data) {
  if (data.length === 0) return [];
  
  const uniqueData = [];
  const seenValues = new Set();
  
  // Look for the column named 'Number'
  const headers = Object.keys(data[0]);
  const numberColumnKey = headers.find(header => header.trim() === 'Number') || headers[0];
  
  for (const row of data) {
    const numberValue = row[numberColumnKey]; // Use the value from the Number column
    
    // Skip rows with undefined or empty number
    if (numberValue === undefined || numberValue === '') continue;
    
    if (!seenValues.has(numberValue)) {
      seenValues.add(numberValue);
      uniqueData.push(row);
    }
  }

  return uniqueData;
}

// Function to convert data to CSV
function convertToCsv(data, headers) {
  const headerRow = headers.join(',');
  const dataRows = data.map(row => headers.map(header => row[header]).join(','));
  return [headerRow, ...dataRows].join('\n');
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});