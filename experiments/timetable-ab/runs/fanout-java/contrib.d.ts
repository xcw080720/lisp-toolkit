// contrib.d.ts — 第 6 样产物（增量测量），fanout.GenProc 编译期生成
export interface AddArgs { course: unknown; }
export declare function add(args: AddArgs): unknown;
export interface DelArgs { match: unknown; }
export declare function del(args: DelArgs): unknown;
export interface EditArgs { match: unknown; set: unknown; }
export declare function edit(args: EditArgs): unknown;
export interface MoveArgs { match: unknown; day: unknown; periodFrom: unknown; periodTo: unknown; }
export declare function move(args: MoveArgs): unknown;
export interface SwapArgs { match: unknown; with: unknown; }
export declare function swap(args: SwapArgs): unknown;
