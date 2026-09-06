const fs = require('fs');

function fixApprovals() {
  let content = fs.readFileSync('src/pages/ApprovalsPage.tsx', 'utf8');
  if (!content.includes("import { useEffect")) {
    content = "import { useEffect, useState, useMemo } from 'react';\n" + content.replace(/import \{ useEffect, useMemo, useState \} from 'react';\n/, '');
  }
  fs.writeFileSync('src/pages/ApprovalsPage.tsx', content);
}

function fixReports() {
  let content = fs.readFileSync('src/pages/ReportsPage.tsx', 'utf8');
  if (!content.includes("import { useEffect")) {
    content = "import { useEffect, useState, useMemo } from 'react';\n" + content;
  }
  fs.writeFileSync('src/pages/ReportsPage.tsx', content);
}

fixApprovals();
fixReports();
