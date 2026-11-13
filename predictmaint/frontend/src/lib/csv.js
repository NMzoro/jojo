function escapeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[";\n]/.test(text) ? `"${text}"` : text;
}

export function downloadCSV(filename, rows, columns) {
  const header = columns.map((column) => escapeCell(column.label)).join(";");
  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const value =
            typeof column.value === "function" ? column.value(row) : row[column.key];
          return escapeCell(value);
        })
        .join(";")
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
