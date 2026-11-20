// ================= 1. Bmob 初始化 =================
// 替换为你自己的 Application ID 和 REST API Key
Bmob.initialize("db80eed7b9cde27c76558aa205a61fe4", "07f56af38959c9cd674a13cbf796481d");

// ================= 2. 生成浏览器指纹 =================
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

// ================= 3. 核心鉴权：体验校验 =================
async function checkAccess() {
    var fp = getFingerprint();
    var localCode = localStorage.getItem('xjt_license_code');
    
    // 本地有注册码，先验注册码
    if (localCode) {
        var isValid = await verifyLicense(localCode, fp);
        if (isValid.ok) return { ok: true, type: 'license' };
    }

    // 没有注册码，走云端体验校验
    try {
        var query = Bmob.Query('TrialUsers');
        query.equalTo('fingerprint', '==', fp);
        var res = await query.find();

        if (res.length > 0) {
            var record = res[0];
            var expireTime = new Date(record.expireTime);
            var now = new Date(); // 以本地时间为基准，建议后续接入云端时间
            if (now < expireTime) {
                var hoursLeft = Math.ceil((expireTime - now) / (1000 * 60 * 60));
                return { ok: true, type: 'trial', msg: '剩余体验时间: ' + hoursLeft + ' 小时' };
            } else {
                return { ok: false, msg: '体验已结束，请输入注册码' };
            }
        } else {
            // 新用户，写入云端，给1天体验
            var Trial = Bmob.Object.extend('TrialUsers');
            var newTrial = new Trial();
            newTrial.set('fingerprint', fp);
            
            var expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + 1); // 加1天
            newTrial.set('expireTime', expireDate);
            
            await newTrial.save();
            return { ok: true, type: 'trial', msg: '获得 1 天免费体验！' };
        }
    } catch (e) {
        console.error("云端校验失败", e);
        return { ok: false, msg: '网络请求失败，请检查网络' };
    }
}

// ================= 4. 核心鉴权：注册码校验 (与App共享) =================
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

        // 如果当前设备没绑定过
        if (!devices.includes(fp)) {
            if (devices.length >= maxDevices) {
                return { ok: false, msg: '该注册码已绑定其他设备，请联系客服解绑' };
            }
            // 没绑满，把新设备加进去
            devices.push(fp);
            license.set('devices', devices);
            await license.save();
        }
        
        // 校验通过，存本地
        localStorage.setItem('xjt_license_code', code);
        return { ok: true };
    } catch (e) {
        console.error("注册码校验失败", e);
        return { ok: false, msg: '网络请求失败' };
    }
}
