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

    // Clean data according to all requirements
    const cleanedData = cleanData(data);

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

// Function to clean data according to requirements
function cleanData(data) {
  if (data.length === 0) return [];
  
  const cleanedData = [];
  const seenValues = new Set();
  
  // Look for the column named 'Number'
  const headers = Object.keys(data[0]);
  const numberColumnKey = headers.find(header => header.trim() === 'Number') || headers[0];
  const nameColumnKey = headers.find(header => header.trim() === 'Name');
  const genderColumnKey = headers.find(header => header.trim() === 'Gender');
  const pointsColumnKey = headers.find(header => header.trim() === 'Points');
  const birthdayColumnKey = headers.find(header => header.trim() === 'Birthday');
  const anniversaryColumnKey = headers.find(header => header.trim() === 'Anniversary');
  
  for (const row of data) {
    // Clean the row according to requirements
    const cleanedRow = { ...row };
    
    // 1. Clean number field (remove +91/91 prefix only if length > 10, and remove non-numeric chars)
    if (numberColumnKey && cleanedRow[numberColumnKey]) {
      let phoneNumber = cleanedRow[numberColumnKey].toString().trim();
      
      // First remove non-numeric characters
      phoneNumber = phoneNumber.replace(/\D/g, '');
      
      // Only remove 91 prefix if number length is greater than 10
      if (phoneNumber.length > 10) {
        if (phoneNumber.startsWith("91") && phoneNumber.length == 12) {
          phoneNumber = phoneNumber.substring(2);
        }
      }
      
      cleanedRow[numberColumnKey] = phoneNumber;
      
      // Only handle duplicates for non-empty phone numbers
      if (cleanedRow[numberColumnKey]) {
        // Skip duplicate numbers (keeps first occurrence only)
        if (seenValues.has(cleanedRow[numberColumnKey])) {
          continue;
        }
        seenValues.add(cleanedRow[numberColumnKey]);
      }
    }
    
    // 2. Clean name (remove numbers and special chars except spaces)
    if (nameColumnKey && cleanedRow[nameColumnKey]) {
      cleanedRow[nameColumnKey] = cleanedRow[nameColumnKey].replace(/[^a-zA-Z\s]/g, '').trim();
    }
    
    // 3. Clean gender (only allow alphabets)
    if (genderColumnKey && cleanedRow[genderColumnKey]) {
      const originalGender = cleanedRow[genderColumnKey].toString().trim();
      cleanedRow[genderColumnKey] = originalGender.replace(/[^a-zA-Z]/g, '').trim();
    }
    
    // 4. Clean points (only allow numbers)
    if (pointsColumnKey && cleanedRow[pointsColumnKey]) {
      cleanedRow[pointsColumnKey] = cleanedRow[pointsColumnKey].replace(/[^0-9]/g, '').trim();
    }
    
    // 5. Format dates (Birthday and Anniversary) to YYYY-MM-DD
    if (birthdayColumnKey && cleanedRow[birthdayColumnKey]) {
      cleanedRow[birthdayColumnKey] = formatDate(cleanedRow[birthdayColumnKey]);
    }
    
    if (anniversaryColumnKey && cleanedRow[anniversaryColumnKey]) {
      cleanedRow[anniversaryColumnKey] = formatDate(cleanedRow[anniversaryColumnKey]);
    }
    
    // Add the cleaned row to the results
    cleanedData.push(cleanedRow);
  }

  return cleanedData;
}

// Helper function to format dates to YYYY-MM-DD
function formatDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return '';
  
  // Try to preserve the original date value if format issues occur
  const originalDate = dateStr.trim();
  
  // Remove non-numeric and non-separator characters
  dateStr = dateStr.replace(/[^0-9\-\/\.]/g, '');
  
  // Skip empty dates after cleaning
  if (!dateStr) return originalDate;
  
  let day, month, year;
  
  // Handle different date formats
  const parts = dateStr.split(/[\-\/\.]/);
  
  if (parts.length !== 3) {
    // If we don't have exactly 3 parts, try to fix based on typical patterns
    if (dateStr.length === 8) {
      // Assume DDMMYYYY or YYYYMMDD
      if (parseInt(dateStr.substring(0, 4)) > 1900) {
        // Likely YYYYMMDD
        year = dateStr.substring(0, 4);
        month = dateStr.substring(4, 6);
        day = dateStr.substring(6, 8);
      } else {
        // Likely DDMMYYYY
        day = dateStr.substring(0, 2);
        month = dateStr.substring(2, 4);
        year = dateStr.substring(4, 8);
      }
    } else {
      // If we can't determine format, return original
      return originalDate;
    }
  } else {
    // We have 3 parts, determine which is which
    if (parts[0].length === 4) {
      // Assume YYYY-MM-DD
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else {
      // Assume DD-MM-YYYY
      day = parts[0];
      month = parts[1];
      year = parts[2];
      
      // Fix 2-digit years
      if (year.length === 2) {
        year = '20' + year;
      }
    }
  }
  
  // Validate components
  day = parseInt(day, 10);
  month = parseInt(month, 10);
  year = parseInt(year, 10);
  
  // Basic validation
  if (isNaN(day) || isNaN(month) || isNaN(year) || 
      day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return originalDate;
  }
  
  // Format properly
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Function to convert data to CSV
function convertToCsv(data, headers) {
  const headerRow = headers.join(',');
  const dataRows = data.map(row => headers.map(header => row[header] || '').join(','));
  return [headerRow, ...dataRows].join('\n');
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
