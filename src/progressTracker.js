const fs = require('fs').promises;
const path = require('path');

class ProgressTracker {
    constructor(year) {
        this.year = year;
        this.progressFile = path.join(__dirname, '..', 'results', year.toString(), 'progress.json');
        this.progress = {
            completed: {},
            mainCodeMap: {},
            lastSubCode: null,
            lastFundType: null,
            totalRecords: 0
        };
    }

    async load() {
        try {
            await fs.mkdir(path.dirname(this.progressFile), { recursive: true });
            const data = await fs.readFile(this.progressFile, 'utf8');
            this.progress = JSON.parse(data);
            console.log(`\n[${this.year}] 已加载进度:`);
            this.printProgress();
        } catch (error) {
            console.log(`[${this.year}] 未找到进度文件，将创建新的进度记录`);
            await this.save();
        }
    }

    async save() {
        await fs.writeFile(
            this.progressFile, 
            JSON.stringify(this.progress, null, 2)
        );
        console.log(`[${this.year}] 进度已保存`);
    }

    isCompleted(subCode, fundType) {
        return this.progress.completed[subCode]?.[fundType]?.isDone === true;
    }

    async markAsCompleted(subCode, fundType, count = 0) {
        if (!this.progress.completed[subCode]) {
            this.progress.completed[subCode] = {};
        }
        
        this.progress.completed[subCode][fundType] = {
            isDone: true,
            count: count,
            completedAt: new Date().toISOString()
        };
        
        this.progress.lastSubCode = subCode;
        this.progress.lastFundType = fundType;
        this.progress.totalRecords += count;
        
        await this.save();
    }

    isSubCodeDone(mainCode, subCode) {
        if (!this.progress.mainCodeMap) {
            this.progress.mainCodeMap = {};
        }
        if (!this.progress.mainCodeMap[mainCode]) {
            this.progress.mainCodeMap[mainCode] = { subCodes: {} };
        }
        return this.progress.mainCodeMap[mainCode]?.subCodes?.[subCode]?.isDone === true;
    }

    async markSubCodeDone(mainCode, subCode, totalCount = 0) {
        if (!this.progress.mainCodeMap) {
            this.progress.mainCodeMap = {};
        }
        if (!this.progress.mainCodeMap[mainCode]) {
            this.progress.mainCodeMap[mainCode] = { subCodes: {} };
        }
        
        this.progress.mainCodeMap[mainCode].subCodes[subCode] = {
            isDone: true,
            totalCount: totalCount,
            completedAt: new Date().toISOString()
        };
        
        await this.save();
    }

    getRecordCount(subCode, fundType) {
        return this.progress.completed[subCode]?.[fundType]?.count || 0;
    }

    getTotalRecords() {
        return this.progress.totalRecords || 0;
    }

    printProgress() {
        console.log(`年份: ${this.year}`);
        console.log(`最后处理的子代码: ${this.progress.lastSubCode || '无'}`);
        console.log(`最后处理的基金类型: ${this.progress.lastFundType || '无'}`);
        console.log(`总记录数: ${this.getTotalRecords()}`);
        
        // 打印已完成的主代码和子代码统计
        for (const [mainCode, data] of Object.entries(this.progress.mainCodeMap)) {
            const doneSubCodes = Object.entries(data.subCodes)
                .filter(([_, info]) => info.isDone)
                .length;
            console.log(`${mainCode}: ${doneSubCodes} 个子代码已完成`);
        }
        console.log();
    }
}

module.exports = ProgressTracker;
  
  