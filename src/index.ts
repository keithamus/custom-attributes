const PCENChar = [
  '(?:\\-',
  '\\.',
  '[0-9]',
  '_',
  '[a-z]',
  '\\xB7', // ·
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
].join('|')
const customAttributeNameRegExp = new RegExp(`^[a-z]${PCENChar}*-${PCENChar}*$`)

type RootNode = ShadowRoot | Document

const unconectedNodes = new Set<Node>()

const customAttrMap = new WeakMap<typeof CustomAttr, CustomAttrInternals>()
class CustomAttrInternals {
  registries = new Set<CustomAttributeRegistryInternals>()

  constructor(attr: typeof CustomAttr) {
    customAttrMap.set(attr, this)
  }

  static for(customAttr: typeof CustomAttr) {
    if (!customAttrMap.has(customAttr)) return new this(customAttr)
    return customAttrMap.get(customAttr)
  }
}

const rootNodeMap = new WeakMap<RootNode, RootInternals>()
class RootInternals {
  registry: CustomAttributeRegistryInternals | null = null
  constructor(node: RootNode) {
    rootNodeMap.set(node, this)
  }

  static for(root: RootNode) {
    if (!rootNodeMap.has(root)) return new this(root)
    return rootNodeMap.get(root)!
  }
}

let currentAttr: CustomAttr | null = null
function CustomAttrMagicConstructor(this: CustomAttr): CustomAttr {
  if (!currentAttr) {
    const internals = CustomAttrInternals.for(new.target as unknown as typeof CustomAttr)
    for (const registry of internals?.registries || []) {
      const name = registry.attributesByCtor.get(new.target as unknown as typeof CustomAttr)
      if (name) {
        currentAttr = Document.prototype.createAttribute.call(document, name)
        break
      }
    }
  }
  if (!currentAttr) throw new Error(`Illegal constructor`)
  return Object.setPrototypeOf(currentAttr, new.target.prototype)
}

export class CustomAttr extends (CustomAttrMagicConstructor as any) {
  connectedCallback?(): void
  attributeChangedCallback?(oldValue: null | string, newValue: null | string): void
  disconnectedCallback?(): void
}
Object.setPrototypeOf(CustomAttr.prototype, Attr.prototype)

function createCustomAttr(oldAttrNode: Attr, Defn: typeof CustomAttr) {
  currentAttr = oldAttrNode
  const instance = new Defn()
  currentAttr = null
  return instance
}

const customAttributeRegistryMap = new WeakMap<CustomAttributeRegistry, CustomAttributeRegistryInternals>()
class CustomAttributeRegistryInternals extends EventTarget {
  attributes = new Map<string, typeof CustomAttr>()
  attributesByCtor = new Map<typeof CustomAttr, string>()
  roots = new Set<RootNode>()
  constructor(registry: CustomAttributeRegistry) {
    super()
    customAttributeRegistryMap.set(registry, this)
  }

  define(attr: string, defn: typeof CustomAttr, options: CustomAttributeRegistryDefineInit) {
    if (this.attributes.get(attr)) {
      throw new Error(`${attr} has already been defined`)
    }
    if (!customAttributeNameRegExp.test(attr)) {
      throw new Error(`${attr} is not a valid custom attribute name`)
    }
    if (!defn || !('prototype' in defn) || !(defn.prototype instanceof CustomAttr)) {
      throw new Error(`class must extend from Attr`)
    }
    this.attributes.set(attr, defn)
    this.attributesByCtor.set(defn, attr)
    CustomAttrInternals.for(defn).registries.add(this)
    for (const node of this.roots) {
      this.upgrade(node)
    }
    this.dispatchEvent(new Event(attr))
  }

  get selector() {
    return [...this.attributes.keys()].map(v => `[${v}]`).join(',')
  }

  upgrade(node: Node) {
    if (!(node instanceof Element || node instanceof Document || node instanceof ShadowRoot)) {
      throw new Error('Argument 1 must be a Node')
    }
    const root = node.getRootNode() as RootNode
    if (!this.roots.has(root)) {
      throw new Error('Cannot apply registry to this root')
    }
    const selector = this.selector
    if (!selector) return
    for (const el of (node as Element).querySelectorAll(selector)) {
      for (const attr of this.attributes.keys()) {
        this.applyToNode(el, attr)
      }
    }
  }

  applyToNode(node: Node, attr: string) {
    const defn = this.attributes.get(attr)
    if (!defn || !(node instanceof Element)) return
    const attrNode = node.getAttributeNode(attr)
    if (!attrNode) return
    if (attrNode instanceof CustomAttr) return
    const attrInstance = createCustomAttr(attrNode, defn)
    attrInstance.attributeChangedCallback?.(null, attrInstance.value)
    if (node.isConnected) {
      attrInstance.connectedCallback()
    } else {
      unconectedNodes.add(node)
    }
  }

  static for(registry: CustomAttributeRegistry) {
    return customAttributeRegistryMap.get(registry)
  }
}

interface CustomAttributeRegistryDefineInit {}

export class CustomAttributeRegistry {
  #internals = new CustomAttributeRegistryInternals(this)

  define(attr: string, defn: typeof CustomAttr, options: CustomAttributeRegistryDefineInit = {}) {
    this.#internals.define(attr, defn, options)
  }

  get(attr: string) {
    return this.#internals.attributes.get(attr)
  }

  upgrade(tree: Node) {
    this.#internals.upgrade(tree)
  }

  async whenDefined(attr: string) {
    return new Promise(resolve => {
      this.#internals.addEventListener(attr, () => resolve(this.get(attr)))
    })
  }

  get [Symbol.toStringTag]() {
    return 'CustomAttributeRegistry'
  }
}

export function apply(rootNode: RootNode, registry) {
  if (!(rootNode instanceof Node)) {
    throw new Error(`Argument 1 must be a Node`)
  }
  if (rootNode.getRootNode() !== rootNode || !(rootNode instanceof ShadowRoot || rootNode instanceof Document)) {
    throw new Error(`Argument 1 must be a Root Node`)
  }
  const registryInternals = CustomAttributeRegistryInternals.for(registry)
  if (!(registry instanceof CustomAttributeRegistry) || !registryInternals) {
    throw new Error(`Argument 2 must be a CustomAttributeRegistry`)
  }
  const internals = RootInternals.for(rootNode)
  if (internals.registry) {
    throw new Error(`Root already has a CustomAttributeRegistry`)
  }
  internals.registry = registry
  registryInternals.roots.add(rootNode)
  ;(rootNode as any).createAttribute = function (name: string) {
    const Defn = registryInternals.attributes.get(name)
    const attrInstance = Document.prototype.createAttribute.call(rootNode.ownerDocument || rootNode, name)
    if (Defn) return createCustomAttr(attrInstance, Defn)
    return attrInstance
  }
  patchElementPrototypes()
  registry.upgrade(rootNode)
  return registry
}

let patched = false
function patchElementPrototypes() {
  if (patched) return
  patched = true
  Element.prototype.setAttribute = function (name, value) {
    const rootNode = this.getRootNode()
    const attribute = (rootNode === this ? document : (rootNode as Document)).createAttribute(name)
    attribute.value = value
    this.setAttributeNode(attribute)
  }
  const setAttributeNode = Element.prototype.setAttributeNode
  Element.prototype.setAttributeNode = function (attribute: Attr): Attr | null {
    const attr = setAttributeNode.call(this, attribute)
    if (attribute instanceof CustomAttr) {
      if (this.isConnected) {
        ;(attribute as CustomAttr).connectedCallback?.()
      } else {
        unconectedNodes.add(this)
      }
    }
    return attr
  }
}
