export declare class ColorStyle {
    static TabToolbar: string;
    static Toolbars: string;
    static HighlightBlue: string;
    static LightText: string;
    static ForegroundText: string;
    static Black: string;
    static VeryDark: string;
    static Dark: string;
    static Light: string;
    static Grey: string;
    static DarkGrey: string;
    static Blue: string;
    static Purple: string;
    static Pink: string;
    static Red: string;
    static Orange: string;
    static LightOrange: string;
    static Green: string;
    static BlueGrey: string;
    private static _randomStyleCache;
    private static _nextStyle;
    static randomStyle(): any;
    static contrastStyle(rgb: string): string;
    static reset(): void;
}
