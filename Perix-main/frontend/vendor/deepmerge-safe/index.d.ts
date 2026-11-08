declare function deepmerge<T>(target: Partial<T>, source: Partial<T>, options?: deepmerge.Options): T;
declare function deepmerge<T1, T2>(target: Partial<T1>, source: Partial<T2>, options?: deepmerge.Options): T1 & T2;
declare namespace deepmerge {
  interface Options {
    arrayMerge?(target: unknown[], source: unknown[], options: Options): unknown[];
    clone?: boolean;
    customMerge?(key: string, options?: Options): ((x: unknown, y: unknown, options?: Options) => unknown) | undefined;
    isMergeableObject?(value: object): boolean;
    cloneUnlessOtherwiseSpecified?(value: unknown, options: Options): unknown;
  }
  function all<T>(objects: Partial<T>[], options?: Options): T;
}
export = deepmerge;
