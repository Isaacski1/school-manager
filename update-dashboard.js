const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'pages/admin/AdminDashboard.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add UserAvatar import
if (!content.includes('import UserAvatar')) {
  content = content.replace(
    'import Layout from "../../components/Layout";\nimport { showToast }',
    'import Layout from "../../components/Layout";\nimport UserAvatar from "../../components/UserAvatar";\nimport { showToast }'
  );
  // fallback if newlines differ
  content = content.replace(
    'import Layout from "../../components/Layout";\r\nimport { showToast }',
    'import Layout from "../../components/Layout";\r\nimport UserAvatar from "../../components/UserAvatar";\r\nimport { showToast }'
  );
}

// 2. Replace red alert avatar
content = content.replace(
  /<div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">\s*<span className="text-sm font-bold text-red-600">\s*\{alert\.teacherName\.charAt\(0\)\}\s*<\/span>\s*<\/div>/g,
  '<UserAvatar user={{ name: alert.teacherName }} size="sm" className="shadow-sm ring-1 ring-red-100" />'
);

// 3. Replace blue alert avatar
content = content.replace(
  /<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">\s*<span className="text-sm font-bold text-blue-700">\s*\{alert\.teacherName\.charAt\(0\)\}\s*<\/span>\s*<\/div>/g,
  '<UserAvatar user={{ name: alert.teacherName }} size="sm" className="shadow-sm ring-1 ring-blue-100" />'
);

// 4. Replace student table avatar
content = content.replace(
  /<div\s+className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white mr-3 shadow-sm \$\{s\.gender === "Male" \? "bg-amber-400" : "bg-\[#0B4A82\]"\}`}\s*>\s*\{s\.name\.charAt\(0\)\}\s*<\/div>/g,
  '<UserAvatar user={s} size="sm" className="mr-3 shadow-sm" />'
);

// 5. Replace viewStudent modal avatar
content = content.replace(
  /<div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-500 shadow-inner">\s*\{viewStudent\.name\.charAt\(0\)\}\s*<\/div>/g,
  '<UserAvatar user={viewStudent} size="xl" className="shadow-inner" />'
);

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully updated AdminDashboard.tsx to use UserAvatar.');
