const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');

// 基金类型配置
const FUND_TYPES = [
    "面上项目",
    "重点项目",
    "重大研究计划",
    "联合基金项目",
    "青年科学基金项目",
    "地区科学基金项目",
    "专项基金项目"
];

/**
 * 读取子类代码配置文件
 * @returns {Promise<Map<string, {mainName: string, subCodes: Array<{code: string, name: string}>}>>}
 */
async function loadSubCodes() {
    const subCodesMap = new Map();
    
    return new Promise((resolve, reject) => {
        const results = [];
        createReadStream(path.join(__dirname, '..', 'keywords', 'filtered_subcodes.csv'))
            .pipe(csv())
            .on('data', (data) => {
                results.push(data);
            })
            .on('end', () => {
                // 组织数据结构
                results.forEach(row => {
                    const { mainCode, mainName, subCode, subName } = row;
                    if (!subCodesMap.has(mainCode)) {
                        subCodesMap.set(mainCode, {
                            mainName,
                            subCodes: []
                        });
                    }
                    subCodesMap.get(mainCode).subCodes.push({
                        code: subCode,
                        name: subName
                    });
                });
                resolve(subCodesMap);
            })
            .on('error', reject);
    });
}

module.exports = {
    FUND_TYPES,
    loadSubCodes
};
