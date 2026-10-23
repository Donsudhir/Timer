import { STORAGE_KEY } from "./constants";

/** Applies the saved theme before first paint. Mirrors ThemeController in components/runtime. */
export const themeScript = `(function(){try{var t="system",r=localStorage.getItem("${STORAGE_KEY}");if(r){var p=JSON.parse(r);t=(p&&p.state&&p.state.settings&&p.state.settings.theme)||t}var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches),e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
