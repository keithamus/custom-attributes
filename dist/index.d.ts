type RootNode = ShadowRoot | Document;
declare const CustomAttr_base: any;
export declare class CustomAttr extends CustomAttr_base {
}
interface CustomAttributeRegistryDefineInit {
}
export declare class CustomAttributeRegistry {
    #private;
    define(attr: string, defn: typeof CustomAttr, options?: CustomAttributeRegistryDefineInit): void;
    get(attr: string): typeof CustomAttr | undefined;
    upgrade(tree: Node): void;
    whenDefined(attr: string): Promise<unknown>;
    get [Symbol.toStringTag](): string;
}
export declare function apply(rootNode: RootNode, registry?: CustomAttributeRegistry): CustomAttributeRegistry;
export {};
