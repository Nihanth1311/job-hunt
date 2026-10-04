export type ThemePref = "light" | "dark" | "system";

export const THEME_KEY = "theme";

/**
 * Runs inline in <head> before paint: resolves the saved choice ("system" follows the OS)
 * and sets data-theme="light" | "dark" on <html>.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
