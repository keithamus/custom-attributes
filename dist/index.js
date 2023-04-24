var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _CustomAttributeRegistry_internals;
const PCENChar = [
    '(?:\\-',
    '\\.',
    '[0-9]',
    '_',
    '[a-z]',
    '\\xB7',
    '[\\u00C0-\\u00D6]',
    '[\\u00D8-\\u00F6]',
    '[\\u00F8-\\u037D]',
    '[\\u037F-\\u1FFF]',
    '[\\u200C-\\u200D]',
    '[\\u203F-\\u2040]',
    '[\\u2070-\\u218F]',
    '[\\u2C00-\\u2FEF]',
    '[\\u3001-\\uD7FF]',
    '[\\uF900-\\uFDCF]',
    '[\\uFDF0-\\uFFFD]',
    '[\\uD800-\\uDB7F]',
    '[\\uDC00-\\uDFFF])',
].join('|');
const customAttributeNameRegExp = new RegExp(`^[a-z]${PCENChar}*-${PCENChar}*$`);
const unconectedNodes = new Set();
const customAttrMap = new WeakMap();
class CustomAttrInternals {
    constructor(attr, name) {
        this.name = name;
        this.roots = new Set();
        customAttrMap.set(attr, this);
    }
    static for(customAttr) {
        return customAttrMap.get(customAttr);
    }
}
const rootNodeMap = new WeakMap();
class RootInternals {
    constructor(node) {
        this.registry = null;
        rootNodeMap.set(node, this);
    }
    static for(root) {
        if (!rootNodeMap.has(root))
            return new this(root);
        return rootNodeMap.get(root);
    }
}
let currentAttr = null;
function CustomAttrMagicConstructor() {
    if (!currentAttr) {
        const internals = CustomAttrInternals.for(this);
        if (internals)
            currentAttr = document.createAttribute(internals.name);
    }
    if (!currentAttr)
        throw new Error(`Illegal constructor`);
    return Object.setPrototypeOf(currentAttr, new.target.prototype);
}
export class CustomAttr extends CustomAttrMagicConstructor {
}
Object.setPrototypeOf(CustomAttr.prototype, Attr.prototype);
function createCustomAttr(oldAttrNode, Defn) {
    currentAttr = oldAttrNode;
    const instance = new Defn();
    currentAttr = null;
    return instance;
}
const customAttributeRegistryMap = new WeakMap();
class CustomAttributeRegistryInternals extends EventTarget {
    constructor(registry) {
        super();
        this.attributes = new Map();
        this.roots = new Set();
        customAttributeRegistryMap.set(registry, this);
    }
    define(attr, defn, options) {
        if (this.attributes.get(attr)) {
            throw new Error(`${attr} has already been defined`);
        }
        if (!customAttributeNameRegExp.test(attr)) {
            throw new Error(`${attr} is not a valid custom attribute name`);
        }
        if (!defn || !('prototype' in defn) || !(defn.prototype instanceof CustomAttr)) {
            throw new Error(`class must extend from Attr`);
        }
        this.attributes.set(attr, defn);
        for (const node of this.roots) {
            this.upgrade(node);
        }
        this.dispatchEvent(new Event(attr));
    }
    get selector() {
        return [...this.attributes.keys()].map(v => `[${v}]`).join(',');
    }
    upgrade(node) {
        if (!(node instanceof Element || node instanceof Document || node instanceof ShadowRoot)) {
            throw new Error('Argument 1 must be a Node');
        }
        const root = node.getRootNode();
        if (!this.roots.has(root)) {
            throw new Error('Cannot apply registry to this root');
        }
        const selector = this.selector;
        if (!selector)
            return;
        for (const el of node.querySelectorAll(selector)) {
            for (const attr of this.attributes.keys()) {
                this.applyToNode(el, attr);
            }
        }
    }
    applyToNode(node, attr) {
        const defn = this.attributes.get(attr);
        if (!defn || !(node instanceof Element))
            return;
        const attrNode = node.getAttributeNode(attr);
        if (!attrNode)
            return;
        if (attrNode instanceof CustomAttr)
            return;
        const attrInstance = createCustomAttr(attrNode, defn);
        attrInstance.attributeChangedCallback?.(null, attrInstance.value);
        if (node.isConnected) {
            attrInstance.connectedCallback();
        }
        else {
            unconectedNodes.add(node);
        }
    }
    static for(registry) {
        return customAttributeRegistryMap.get(registry);
    }
}
export class CustomAttributeRegistry {
    constructor() {
        _CustomAttributeRegistry_internals.set(this, new CustomAttributeRegistryInternals(this));
    }
    define(attr, defn, options = {}) {
        __classPrivateFieldGet(this, _CustomAttributeRegistry_internals, "f").define(attr, defn, options);
    }
    get(attr) {
        return __classPrivateFieldGet(this, _CustomAttributeRegistry_internals, "f").attributes.get(attr);
    }
    upgrade(tree) {
        __classPrivateFieldGet(this, _CustomAttributeRegistry_internals, "f").upgrade(tree);
    }
    async whenDefined(attr) {
        return new Promise(resolve => {
            __classPrivateFieldGet(this, _CustomAttributeRegistry_internals, "f").addEventListener(attr, () => resolve(this.get(attr)));
        });
    }
    get [(_CustomAttributeRegistry_internals = new WeakMap(), Symbol.toStringTag)]() {
        return 'CustomAttributeRegistry';
    }
}
export function apply(rootNode, registry = new CustomAttributeRegistry()) {
    if (!(rootNode instanceof Node)) {
        throw new Error(`Argument 1 must be a Node`);
    }
    if (rootNode.getRootNode() !== rootNode || !(rootNode instanceof ShadowRoot || rootNode instanceof Document)) {
        throw new Error(`Argument 1 must be a Root Node`);
    }
    const registryInternals = CustomAttributeRegistryInternals.for(registry);
    if (!(registry instanceof CustomAttributeRegistry) || !registryInternals) {
        throw new Error(`Argument 2 must be a CustomAttributeRegistry`);
    }
    const internals = RootInternals.for(rootNode);
    if (internals.registry) {
        throw new Error(`Root already has a CustomAttributeRegistry`);
    }
    internals.registry = registry;
    registryInternals.roots.add(rootNode);
    rootNode.createAttribute = function (name) {
        const Defn = registryInternals.attributes.get(name);
        const attrInstance = Document.prototype.createAttribute.call(rootNode.ownerDocument || rootNode, name);
        if (Defn)
            return createCustomAttr(attrInstance, Defn);
        return attrInstance;
    };
    patchElementPrototypes();
    registry.upgrade(rootNode);
    return registry;
}
let patched = false;
function patchElementPrototypes() {
    if (patched)
        return;
    patched = true;
    Element.prototype.setAttribute = function (name, value) {
        const attribute = this.getRootNode().createAttribute(name);
        attribute.value = value;
        this.setAttributeNode(attribute);
    };
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function ({ attributeRegistry, ...options }) {
        const shadow = originalAttachShadow.call(this, options);
        if (attributeRegistry)
            apply(shadow, attributeRegistry);
        return shadow;
    };
}
