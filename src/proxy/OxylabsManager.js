class OxylabsManager {
    constructor(config) {
        this.username = config.username;
        this.password = config.password;
        this.endpoints = [
            'cnt9t1is.com:8000',    // 北京节点
            'a81298871.com:8000'    // 香港节点
        ];
        this.currentEndpointIndex = 0;
        this.requestCount = 0;
        this.maxRequestsPerIP = 50; // 每个IP最多使用50次请求
        this.lastRotateTime = Date.now();
        
        // 添加随机延迟范围
        this.minDelay = 1000;  // 最小延迟1秒
        this.maxDelay = 3000;  // 最大延迟3秒
    }

    getProxyUrl() {
        this.requestCount++;
        
        if (this.requestCount >= this.maxRequestsPerIP) {
            this.rotateEndpoint();
            this.requestCount = 0;
        }

        // 确保使用完整的 URL 格式
        const endpoint = this.endpoints[this.currentEndpointIndex];
        const proxyUrl = `http://customer-${this.username}:${this.password}@${endpoint}`;
        
        console.log('生成代理 URL:', proxyUrl); // 添加日志
        
        return {
            proxyUrl,
            headers: {}
        };
    }

    rotateEndpoint() {
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
        this.lastRotateTime = Date.now();
        console.log(`[${new Date().toISOString()}] 已轮换到新节点: ${this.endpoints[this.currentEndpointIndex]}`);
    }

    // 获取随机延迟时间
    getRandomDelay() {
        return Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1)) + this.minDelay;
    }
}

module.exports = OxylabsManager; 