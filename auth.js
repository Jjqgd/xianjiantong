// 1.直接用 Application ID 和 REST API Key 初始化 Web 端
Bmob.initialize("db80eed7b9cde27c76558aa205a61fe4", "07f56af38959c9cd674a13cbf796481d");
// 2. 使用 Secret Key 和 API 安全码初始化
Bmob.initialize("db80eed7b9cde27c76558aa205a61fe4", "61052119491001");

// 3. 生成浏览器指纹（保持不变）
function getFingerprint() {
    var fp = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        navigator.hardwareConcurrency || 'unknown',
        navigator.language
    ].join('###');
    var hash = 0;
    for (var i = 0; i < fp.length; i++) {
        hash = ((hash << 5) - hash) + fp.charCodeAt(i);
        hash = hash & hash; 
    }
    return 'fp_' + Math.abs(hash);
}

// 4. 核心鉴权：体验校验（API 改为 Bmob 语法）
async function checkAccess() {
    var fp = getFingerprint();
    var localCode = localStorage.getItem('xjt_license_code');
    
    if (localCode) {
        var isValid = await verifyLicense(localCode, fp);
        if (isValid.ok) return { ok: true, type: 'license' };
    }

    try {
        // Bmob 查询语法
        var query = Bmob.Query('TrialUsers');
        query.equalTo('fingerprint', '==', fp);
        var res = await query.find();

        if (res.length > 0) {
            var record = res[0];
            var expireTime = new Date(record.expireTime);
            var now = new Date();
            if (now < expireTime) {
                var hoursLeft = Math.ceil((expireTime - now) / (1000 * 60 * 60));
                return { ok: true, type: 'trial', msg: '剩余体验时间: ' + hoursLeft + ' 小时' };
            } else {
                return { ok: false, msg: '体验已结束，请输入注册码' };
            }
        } else {
            // Bmob 创建数据语法
            var Trial = Bmob.Object.extend('TrialUsers');
            var newTrial = new Trial();
            newTrial.set('fingerprint', fp);
            var expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + 1);
            newTrial.set('expireTime', expireDate);
            await newTrial.save();
            return { ok: true, type: 'trial', msg: '获得 1 天免费体验！' };
        }
    } catch (e) {
        console.error("云端校验失败", e);
        return { ok: false, msg: '网络请求失败，请检查网络' };
    }
}

// 5. 核心鉴权：注册码校验（API 改为 Bmob 语法）
async function verifyLicense(code, fp) {
    try {
        var query = Bmob.Query('LicenseCodes');
        query.equalTo('code', '==', code);
        var res = await query.find();

        if (res.length === 0) return { ok: false, msg: '注册码不存在' };

        var license = res[0];
        var expireTime = new Date(license.expireTime);
        if (new Date() > expireTime) return { ok: false, msg: '注册码已过期' };

        var devices = license.devices || [];
        var maxDevices = license.maxDevices || 1;

        if (!devices.includes(fp)) {
            if (devices.length >= maxDevices) {
                return { ok: false, msg: '该注册码已绑定其他设备，请联系客服解绑' };
            }
            devices.push(fp);
            license.set('devices', devices);
            await license.save();
        }
        
        localStorage.setItem('xjt_license_code', code);
        return { ok: true };
    } catch (e) {
        console.error("注册码校验失败", e);
        return { ok: false, msg: '网络请求失败' };
    }
}
