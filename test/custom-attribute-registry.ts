import {expect} from '@open-wc/testing'
import {apply, CustomAttr, CustomAttributeRegistry} from '../src/index.ts'

let registry = null
function createTheDocumentRegistry() {
  if (registry) return registry
  registry = new CustomAttributeRegistry()
  apply(document, registry)
  return registry
}

describe('CustomAttributeRegistry', () => {
  it('is a class', () => {
    expect(CustomAttributeRegistry).to.be.a('function')
  })

  it('instantiates successfully', () => {
    expect(new CustomAttributeRegistry()).to.be.instanceof(CustomAttributeRegistry)
  })

  it('can define an attribute by name and constructor, and retrieve it back', () => {
    const reg = new CustomAttributeRegistry()
    class MyAttr extends CustomAttr {}
    expect(reg.define('my-attr', MyAttr)).to.equal(undefined)
    expect(reg.get('my-attr')).to.equal(MyAttr)
  })

  it('can be applied to roots, but only once', () => {
    const shadow = document.createElement('div').attachShadow({mode: 'open'})
    const registry = new CustomAttributeRegistry()
    apply(shadow, registry)
    expect(() => apply(shadow, registry)).to.throw(/Root already has a CustomAttributeRegistry/)
  })

  it('allows for a single registry on multiple roots', () => {
    const shadowA = document.createElement('div').attachShadow({
      mode: 'open',
    })
    const shadowB = document.createElement('div').attachShadow({
      mode: 'open',
    })

    const registry = new CustomAttributeRegistry()
    expect(() => {
      apply(shadowA, registry)
      apply(shadowB, registry)
    }).to.not.throw()
  })

  describe('the document registry', () => {
    class MyAttr extends CustomAttr {}
    before(() => {
      createTheDocumentRegistry()
      registry.define('my-attr', MyAttr)
    })

    it('allows custom attributes to be created with document.createAttribute', () => {
      expect(document.createAttribute('my-attr')).to.be.instanceof(MyAttr)
    })

    it('allows custom attributes to be created with Element.prototype.setAttribute', () => {
      const el = document.createElement('div')
      el.setAttribute('my-attr', '')
      expect(el.getAttributeNode('my-attr')).to.be.instanceof(MyAttr)
    })
  })

  describe('shadowroot registries', () => {
    const shadow = document.createElement('div').attachShadow({mode: 'open'})
    const registry = new CustomAttributeRegistry()
    class MyAttr extends CustomAttr {}
    before(() => {
      apply(shadow, registry)
      registry.define('my-attr', MyAttr)
    })

    it('allows custom attributes to be created with root.createAttribute', () => {
      expect((shadow as any).createAttribute('my-attr')).to.be.instanceof(MyAttr)
    })

    it('does not infect other roots', () => {
      const otherShadow = document.createElement('div').attachShadow({
        mode: 'open',
      })
      apply(otherShadow, new CustomAttributeRegistry())
      expect((otherShadow as any).createAttribute('my-attr')).to.not.be.instanceof(MyAttr)
    })

    it('does not infect document', () => {
      expect(document.createAttribute('my-attr')).to.not.be.instanceof(MyAttr)
    })
  })

  describe('CustomAttr', () => {
    it('is a class', () => {
      expect(CustomAttr).to.be.a('function')
    })

    it('cannot be constructed', () => {
      expect(() => new CustomAttr()).to.throw(/Illegal/)
    })

    it('throws for extensions', () => {
      class MyAttr extends CustomAttr {}
      expect(() => new MyAttr()).to.throw(/Illegal/)
    })

    it('does not throw for extended versions that are on a connected registry', () => {
      class MyAttr extends CustomAttr {}
      const registry = new CustomAttributeRegistry()
      registry.define('my-attr', MyAttr)
      apply(document.createElement('div').attachShadow({mode: 'open'}), registry)
      expect(() => new MyAttr()).to.not.throw()
    })
  })

  describe('CustomAttr lifecycle', () => {
    class LifeCycleTester extends CustomAttr {
      connectedCalls = 0
      connectedCallback() {
        this.connectedCalls += 1
      }
      disconnectedCalls = 0
      disconnectedCallback() {
        this.disconnectedCalls += 1
      }
      attributeChangedCalls = 0
      attributeChangedCallback() {
        this.attributeChangedCalls += 1
      }
    }
    let fixture
    before(() => {
      createTheDocumentRegistry()
    })
    beforeEach(() => {
      fixture = document.createElement('div')
      document.body.append(fixture)
    })
    afterEach(() => fixture.remove())

    describe('connectecCallback', () => {
      it('is called when an attribute is added to a connected element', () => {
        const div = document.createElement('div')
        fixture.append(div)
        const attr = new LifeCycleTester()
        div.setAttributeNode(attr)
        expect(attr.connectedCalls).to.equal(1)
      })
    })
  })
})
