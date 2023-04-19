const PCENChar = [
  "(?:\\-",
  "\\.",
  "[0-9]",
  "_",
  "[a-z]",
  "\\xB7", // ·
  "[\\u00C0-\\u00D6]",
  "[\\u00D8-\\u00F6]",
  "[\\u00F8-\\u037D]",
  "[\\u037F-\\u1FFF]",
  "[\\u200C-\\u200D]",
  "[\\u203F-\\u2040]",
  "[\\u2070-\\u218F]",
  "[\\u2C00-\\u2FEF]",
  "[\\u3001-\\uD7FF]",
  "[\\uF900-\\uFDCF]",
  "[\\uFDF0-\\uFFFD]",
  "[\\uD800-\\uDB7F]",
  "[\\uDC00-\\uDFFF])",
].join("|");
const customAttributeNameRegExp = new RegExp(
  `^[a-z]${PCENChar}*-${PCENChar}*$`
);

class Deferred {
  resolve = null;
  reject = null;
  then = null;
  catch = null;
  constructor() {
    const promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.then = (resolve, reject) => promise.then(resolve, reject);
    this.catch = (reject) => promise.catch();
  }
}

let currentAttr = null;
export class CustomAttr extends function () {
  if (!currentAttr) {
    throw new Error(`Illegal constructor`);
  }
  return Object.setPrototypeOf(currentAttr, new.target.prototype);
} {}
Object.setPrototypeOf(CustomAttr.prototype, Attr.prototype);
function createCustomAttr(oldAttrNode, Defn) {
  currentAttr = oldAttrNode;
  const instance = new Defn();
  currentAttr = null;
  return instance;
}

const registriesAttachedToRootNodes = new Map();
const attrInstances = new Map();
const unconnectedNodes = new WeakSet();
const registries = new Map();
export class CustomAttributeRegistry {
  #registry = new Map();
  #whens = new Map();
  #whenResolvers = new Map();
  constructor() {
    registries.set(this, this.#registry);
  }

  define(attr, defn, options) {
    if (this.#registry.has(attr)) {
      throw new Error(`${attr} has alreaddy been defined`);
    }
    if (!customAttributeNameRegExp.test(attr)) {
      throw new Error(`${attr} is not a valid custom attribute name`);
    }
    if (
      !defn ||
      !("prototype" in defn) ||
      !(defn.prototype instanceof CustomAttr)
    ) {
      throw new Error(`class must extend from Attr`);
    }
    this.#registry.set(attr, defn);
    for (const node of registriesAttachedToRootNodes.get(this)) {
      this.#apply(node);
    }
  }

  get(attr) {
    return this.#registry.get(attr);
  }

  upgrade(tree) {
    if (!(tree instanceof Node)) {
      throw new Error("Argument 1 must be a Node");
    }
    const root = tree.getRootNode();
    if (!registriesAttachedToRootNodes.get(this)?.has(root)) {
      throw new Error("Cannot apply registry to this root");
    }
    this.#apply(tree);
  }

  async whenDefined() {
    if (this.#whens.has(attr)) return await this.#whens.get(attr);

    const when = new Deferred();
    this.#whens.set(attr, when);
    return await when;
  }

  get [Symbol.toStringTag]() {
    return "CustomAttributeRegistry";
  }

  get #selector() {
    console.log(this.#registry.keys());
    return [...this.#registry.keys()].map((v) => `[${v}]`).join(",");
  }

  #apply(rootNode) {
    const selector = this.#selector;
    console.log("selector-->", selector);
    if (!selector) return;
    for (const node of rootNode.querySelectorAll(selector)) {
      for (const attr of this.#registry.keys()) {
        this.#applyToNode(node, attr);
      }
    }
  }

  #applyToNode(node, attr) {
    const defn = this.#registry.get(attr);
    if (!defn) return;
    const attrNode = node.getAttributeNode(attr);
    if (!attrNode) return;
    if (attrNode instanceof CustomAttr) return;
    const attrInstance = createCustomAttr(attrNode, defn);
    attrInstance.attributeChangedCallback?.(null, attrInstance.value);
    if (node.isConnected) {
      attrInstance.connectedCallback();
    } else {
      unconectedNodes.add(node);
    }
  }
}

export function apply(tree, registry = new CustomAttributeRegistry()) {
  if (!(registry instanceof CustomAttributeRegistry)) {
    throw new Error(`Argument 1 must be a CustomAttributeRegistry`);
  }
  if (!(tree instanceof Node)) {
    throw new Error(`Argument 2 must be a Node`);
  }
  const root = tree.getRootNode();
  if (
    tree !== root ||
    !(tree instanceof ShadowRoot || tree instanceof Document)
  ) {
    throw new Error(`Argument 2 must be a Root Node`);
  }
  if (!registriesAttachedToRootNodes.has(registry)) {
    registriesAttachedToRootNodes.set(registry, new Set());
  }
  for (const registrySet of registriesAttachedToRootNodes.values()) {
    if (registrySet.has(root)) {
      throw new Error(`Root already has a CustomAttributeRegistry`);
    }
  }
  registriesAttachedToRootNodes.get(registry).add(root);
  root.createAttribute = function (name) {
    const currentRegistry = registries.get(registry);
    const Defn = currentRegistry.get(name);
    const attrInstance = Document.prototype.createAttribute.call(
      root.ownerDocument || root,
      name
    );
    if (Defn) return createCustomAttr(attrInstance, Defn);
    return attrInstance;
  };
  patchElementPrototypes();
  registry.upgrade(root);
  return registry;
}

let patched = false;
function patchElementPrototypes() {
  if (patched) return;
  patched = true;
  Element.prototype.setAttribute = function (name, value) {
    const attribute = this.getRootNode().createAttribute(name);
    attribute.value = value;
    this.setAttributeNode(attribute);
  };
}
