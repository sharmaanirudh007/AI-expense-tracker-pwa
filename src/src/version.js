// Version utility for PWA updates
export const APP_VERSION = '1.2.0';

export function checkVersion() {
    const storedVersion = localStorage.getItem('app_version');
    const currentVersion = APP_VERSION;
    
    if (storedVersion && storedVersion !== currentVersion) {
        console.log(`App updated from ${storedVersion} to ${currentVersion}`);
        // Clear any necessary caches or data for major updates
        if (shouldClearDataOnUpdate(storedVersion, currentVersion)) {
            clearAppData();
        }
    }
    
    localStorage.setItem('app_version', currentVersion);
    return {
        isNewVersion: storedVersion !== currentVersion,
        previousVersion: storedVersion,
        currentVersion
    };
}

function shouldClearDataOnUpdate(oldVersion, newVersion) {
    // Define version ranges that require data clearing
    const majorUpdateRanges = [
        { from: '1.0.0', to: '2.0.0' }
    ];
    
    return majorUpdateRanges.some(range => 
        compareVersions(oldVersion, range.from) >= 0 && 
        compareVersions(newVersion, range.to) >= 0
    );
}

function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}

function clearAppData() {
    // Clear specific data that might be incompatible
    console.log('Clearing app data for major version update');
    // Add specific cleanup logic here if needed
}
