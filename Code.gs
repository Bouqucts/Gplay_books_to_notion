const NOTION_TOKEN = 'YOUR NOTION TOKEN';
const BOOKS_DB_ID = 'YOUR BOOK DATABASE ID';
const HIGHLIGHTS_DB_ID = 'YOUR HIGHLIGHTS ID'; 
const FOLDER_ID = 'YOUR DRIVE FOLDER ID';

function syncSmartParsing() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  const scriptProperties = PropertiesService.getScriptProperties();
  
  while (files.hasNext()) {
    let file = files.next();
    let fileId = file.getId();
    
    let lastUpdated = file.getLastUpdated().getTime().toString();
    if (scriptProperties.getProperty(fileId) === lastUpdated) {
      console.log("Skipping " + file.getName() + " (no changes detected)");
      continue;
    }

    let doc = DocumentApp.openById(fileId);
    let rawTitle = file.getName()
      .replace('Notes from "', '')
      .replace('"', '')
      .trim();
    
    let bookPageId = getOrCreateBook(rawTitle);
    let body = doc.getBody();
    let paragraphs = body.getParagraphs();
    
    let currentHighlight = "";
    let currentNote = "";

    for (let i = 0; i < paragraphs.length; i++) {
      let p = paragraphs[i];
      let text = p.getText().trim();
      
      if (text === "" || text.includes("All your annotations") || text.includes("notes/highlights")) continue;

      let isHighlighted = false;
      try { 
        let bgColor = p.getAttributes().BACKGROUND_COLOR;
        isHighlighted = (bgColor !== null && bgColor !== '#ffffff'); 
      } catch(e) {}

      if (isHighlighted) {
        if (currentHighlight !== "") {
          sendToNotion(bookPageId, currentHighlight, currentNote);
        }
        currentHighlight = text;
        currentNote = ""; 
      } else if (currentHighlight !== "" && text.length > 0) {
        let isPageNumber = /^\d+$/.test(text); 
        let isDate = text.match(/^\d+\.?\s+\w+\s+\d{4}$/) || text.match(/^[A-Z][a-z]+ \d+, \d{4}$/);

        if (!isPageNumber && !isDate) {
          currentNote = text;
        }
      }
    }

    if (currentHighlight !== "") {
      sendToNotion(bookPageId, currentHighlight, currentNote);
    }

    scriptProperties.setProperty(fileId, lastUpdated);
    console.log("Successfully synced book: " + rawTitle);
  }
}

function sendToNotion(bookId, highlight, note) {
  const url = 'https://api.notion.com/v1/pages';
  const payload = {
    parent: { database_id: HIGHLIGHTS_DB_ID },
    properties: {
      "Highlight": { "title": [{ "text": { "content": highlight.substring(0, 2000) } }] },
      "Note": { "rich_text": [{ "text": { "content": note || "-" } }] },
      "Books": { "relation": [{ "id": bookId }] }
    }
  };
  
  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    console.log("Failed to send highlight: " + res.getContentText());
  }
}

function getOrCreateBook(title) {
  const url = `https://api.notion.com/v1/databases/${BOOKS_DB_ID}/query`;
  const headers = {
    'Authorization': 'Bearer ' + NOTION_TOKEN,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };
  
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify({ filter: { property: "Name", title: { equals: title } } })
  });
  
  const data = JSON.parse(res.getContentText());
  if (data.results && data.results.length > 0) return data.results[0].id;
  
  const createRes = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: headers,
    payload: JSON.stringify({
      parent: { database_id: BOOKS_DB_ID },
      properties: { "Name": { title: [{ text: { content: title } }] } }
    })
  });
  return JSON.parse(createRes.getContentText()).id;
}

function resetMemori() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  console.log("Memory cleared! You can now run syncSmartParsing.");
}
