const fs = require('fs').promises;
const path = require('path');

/**
 * 基础延时函数
 * @param {number} ms - 延时毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机延时函数
 * @param {number} min - 最小延时毫秒数
 * @param {number} max - 最大延时毫秒数
 * @returns {Promise<void>}
 */
function randomSleep(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    // console.log(`等待 ${delay/1000} 秒...`);
    return sleep(delay);
}

/**
 * CSV字符串转义
 * @param {any} str - 需要转义的值
 * @returns {string} - 转义后的字符串
 */
function escapeCSV(str) {
    if (str === null || str === undefined) return '';
    str = str.toString();
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * 保存搜索结果到文件
 * @param {Array} results - 搜索结果数组
 * @param {number} year - 年份
 * @param {string} code - 申请代码
 * @returns {Promise<void>}
 */
async function saveToFile(results, year, code) {
    if (!results || results.length === 0) return;

    const yearDir = path.join(__dirname, '..', 'results', year.toString());
    await fs.mkdir(yearDir, { recursive: true });

    const filename = path.join(yearDir, `${code}.csv`);
    let fileExists = false;

    try {
        await fs.access(filename);
        fileExists = true;
    } catch (error) {
        // 文件不存在，这是正常的
    }

    // 准备CSV内容
    const headers = [
        'searchYear', 'searchFund', 'searchCode',
        'id', 'title', 'approveText',
        'codeText', 'fundTypeText', 'personText',
        'money', 'approveYear', 'endYear',
        'organization', 'keywords'
    ];

    const rows = results.map(result => 
        headers.map(header => escapeCSV(result[header])).join(',')
    );

    // 如果文件不存在，添加表头
    if (!fileExists) {
        rows.unshift(headers.join(','));
    }

    // 追加到文件
    await fs.appendFile(filename, rows.join('\n') + '\n');
    console.log(`已保存 ${results.length} 条记录到 ${filename}`);
}

module.exports = {
    sleep,
    randomSleep,
    escapeCSV,
    saveToFile
};
