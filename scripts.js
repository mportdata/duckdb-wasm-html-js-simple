import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/+esm";

let db;

async function initDuckDB() {
  try {
    // receive the bundles of files required to run duckdb in the browser
    // this is the compiled wasm code, the js and worker scripts
    // worker scripts are js scripts ran in background threads (not the same thread as the ui)
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    // select bundle is a function that selects the files that will work with your browser
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    // creates storage and an address for the main worker
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      })
    );

    // creates the worker and logger required for an instance of duckdb
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);

    // loads the web assembly module into memory and configures it
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // revoke the object url now no longer needed
    URL.revokeObjectURL(worker_url);
    console.log("DuckDB-Wasm initialized successfully.");
  } catch (error) {
    console.error("Error initializing DuckDB-Wasm:", error);
  }
}

async function uploadTable() {
  try {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files ? fileInput.files[0] : null;

    if (!file) {
      alert("Please select a file first.");
      return;
    }

    const tableNameInput = document.getElementById("tableNameInput");
    const tableName = tableNameInput.value;

    if (!tableName) {
      alert("Please enter a valid table name.");
      return;
    }

    const arrayBuffer = await file.arrayBuffer();

    if (!db) {
      console.error("DuckDB-Wasm is not initialized");
      return;
    }
    console.log("File loaded:", file.name);

    const conn = await db.connect();
    console.log("Database connection established");

    const fileType = file.name.split(".").pop()?.toLowerCase() || "";

    if (fileType === "csv" || fileType === "parquet" || fileType === "json") {
      // Register the file in DuckDB's virtual file system
      const virtualFileName = `/${file.name}`;
      await db.registerFileBuffer(virtualFileName, new Uint8Array(arrayBuffer));

      let query = "";
      if (fileType === "csv") {
        query = `CREATE TABLE '${tableName}' AS FROM read_csv_auto('${virtualFileName}', header = true)`;
      } else if (fileType === "parquet") {
        query = `CREATE TABLE '${tableName}' AS FROM read_parquet('${virtualFileName}')`;
      } else if (fileType === "json") {
        query = `CREATE TABLE '${tableName}' AS FROM read_json_auto('${virtualFileName}')`;
      }

      await conn.query(query);
      updateTableList();
    } else {
      console.log("Invalid file type: ", fileType);
    }
  } catch (error) {
    console.error("Error processing file or querying data:", error);
  }
}

async function updateTableList() {
  console.log("now running updateTableList");
  try {
    if (!db) {
      console.error("DuckDB-Wasm is not initialized");
      return;
    }

    const conn = await db.connect();
    console.log("Database connection established");
    const query = `SELECT table_name as TABLES FROM information_schema.tables WHERE table_schema = 'main';;`;
    const showTables = await conn.query(query);

    const rowCount = showTables.numRows;
    const tablesDiv = document.getElementById("tablesDiv");
    const queryEntryDiv = document.getElementById("queryEntryDiv");
    console.log("rowCount: ", rowCount);

    if (rowCount === 0) {
      tablesDiv.style.display = "none";
      queryEntryDiv.style.display = "none";
    } else {
      tablesDiv.style.display = "block";
      queryEntryDiv.style.display = "block";
      arrowToHtmlTable(showTables, "tablesTable");
      await conn.close();
      console.log("Database connection closed");
    }
  } catch (error) {
    console.error("Error processing file or querying data:", error);
  }
}

function arrowToHtmlTable(arrowTable, htmlTableId) {
  // Log the arrowTable to see if it's valid
  console.log("arrowTable:", arrowTable);

  if (!arrowTable) {
    console.error("The arrowTable object is invalid or null.");
    return;
  }

  const tableSchema = arrowTable.schema.fields.map((field) => field.name);
  console.log("tableSchema:", tableSchema); // Log the schema

  const tableRows = arrowTable.toArray();
  console.log("tableRows:", tableRows); // Log the rows

  let htmlTable = document.getElementById(htmlTableId);
  if (!htmlTable) {
    console.error(`Table with ID ${htmlTableId} not found in the DOM.`);
    return;
  }

  htmlTable.innerHTML = "";
  let tableHeaderRow = document.createElement("tr");
  htmlTable.appendChild(tableHeaderRow);
  tableSchema.forEach((tableColumn) => {
    let th = document.createElement("th");
    th.innerText = tableColumn;
    tableHeaderRow.appendChild(th);
  });

  tableRows.forEach((tableRow) => {
    let tr = document.createElement("tr");
    htmlTable.appendChild(tr);
    tableSchema.forEach((tableColumn) => {
      let td = document.createElement("td");
      td.innerText = tableRow[tableColumn];
      tr.appendChild(td);
    });
  });
}

async function runQuery() {
  const queryInput = document.getElementById("queryInput");
  let query = queryInput.value;
  const queryResultsDiv = document.getElementById("queryResultsDiv");

  // Make sure the results div is visible before populating it
  queryResultsDiv.style.display = "block";

  const lastQueryDiv = document.getElementById("lastQueryDiv");
  lastQueryDiv.innerHTML = query;

  const resultTable = document.getElementById("resultTable");
  const resultErrorDiv = document.getElementById("resultErrorDiv");

  try {
    if (!db) {
      console.error("DuckDB-Wasm is not initialized");
      return;
    }

    const conn = await db.connect();
    console.log("Database connection established");

    const result = await conn.query(query);
    arrowToHtmlTable(result, "resultTable");
    updateTableList();
    queryResultsDiv.style.display = "block";
    resultTable.style.display = "block";
    resultErrorDiv.style.display = "none";
    resultErrorDiv.innerHTML = "";

    await conn.close();
    console.log("Database connection closed");
  } catch (error) {
    resultTable.style.display = "none";
    resultTable.innerHTML = "";
    resultErrorDiv.style.display = "block";
    resultErrorDiv.innerHTML = error;
    console.error("Error processing file or querying data:", error);
  }
}

// Initialize DuckDB on page load
document.addEventListener("DOMContentLoaded", () => {
  initDuckDB();

  window.uploadTable = uploadTable;
  window.runQuery = runQuery;
});
