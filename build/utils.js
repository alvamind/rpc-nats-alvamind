import 'reflect-metadata';
export function getAllInterfaceMethods(target) {
    const methods = [];
    if (!target || !target.prototype)
        return methods;
    for (const key of Object.getOwnPropertyNames(target.prototype)) {
        if (key === 'constructor' || typeof target.prototype[key] !== 'function')
            continue;
        methods.push({ key, subject: `${target.name}.${key}` });
    }
    return methods;
}
//# sourceMappingURL=utils.js.map