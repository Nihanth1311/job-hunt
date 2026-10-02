// "Clip" bookmarklet: runs on a job posting you're viewing, reads the job, and hands it
// to your Job Hunt HQ tab. It only reads the page you have open; nothing is fetched behind
// the scenes, so it works on sites that block automated access (Adzuna, LinkedIn, Naukri…).

/** What the bookmarklet sends to /capture. */
export interface ClipPayload {
  type: "jh-capture";
  url: string;
  pageTitle: string;
  title: string;
  company: string;
  location: string;
  description: string;
  /** description is HTML (from the page's JobPosting data) rather than plain text. */
  html: boolean;
}

export function isClipPayload(x: unknown): x is ClipPayload {
  return Boolean(x) && typeof x === "object" && (x as ClipPayload).type === "jh-capture" && typeof (x as ClipPayload).description === "string";
}

// Plain ES5, no "%" and no comments: it's turned into a javascript: URL.
// Order of preference: the page's schema.org JobPosting data (what Google Jobs reads) ->
// text you selected -> a known description element -> the main content.
const SOURCE = `(function(){
var O="__ORIGIN__";
function t(e){return e?(e.innerText||e.textContent||"").trim():""}
var d={type:"jh-capture",url:location.href,pageTitle:document.title,title:"",company:"",location:"",description:"",html:false};
try{var ls=document.querySelectorAll('script[type="application/ld+json"]');
for(var i=0;i<ls.length&&!d.description;i++){var j=JSON.parse(ls[i].textContent);var a=[].concat(j&&j["@graph"]?j["@graph"]:j);
for(var k=0;k<a.length;k++){var p=a[k];if(p&&String(p["@type"]).indexOf("JobPosting")>-1&&p.description){
var o=p.hiringOrganization;d.title=p.title||"";d.company=(o&&(o.name||o))||"";
var L=[].concat(p.jobLocation||[])[0];var A=L&&L.address;d.location=A?[A.addressLocality,A.addressRegion].filter(Boolean).join(", "):"";
d.description=String(p.description);d.html=true;break}}}}catch(e){}
var s=String(getSelection()).trim();if(s.length>200){d.description=s;d.html=false}
if(!d.description){var q=['[itemprop="description"]','#jobDescriptionText','.jobs-description__content','.show-more-less-html__markup','[data-automation-id="jobPostingDescription"]','[class*="job-description"]','[class*="jobDescription"]','[class*="JobDescription"]','[class*="dang-inner-html"]','[class*="description"]'];
for(var m=0;m<q.length&&!d.description;m++){var el=document.querySelector(q[m]);if(el&&t(el).length>200)d.description=t(el)}}
if(!d.description)d.description=t(document.querySelector("main")||document.body);
d.description=d.description.slice(0,30000);
try{navigator.clipboard.writeText(JSON.stringify(d)).catch(function(){})}catch(e){}
var w=window.open(O+"/capture");
window.addEventListener("message",function(e){if(e.origin===O&&e.data&&e.data.type==="jh-ready"&&w)w.postMessage(d,O)});
})()`;

/** The bookmarklet URL for an app running at `origin` (e.g. http://localhost:3000). */
export function buildBookmarklet(origin: string): string {
  const code = SOURCE.replace("__ORIGIN__", origin.replace(/\/$/, "")).replace(/\n/g, "");
  return `javascript:${encodeURIComponent(code)}`;
}

/** Adzuna's ad id from any of its URLs (details page, redirect, land page). */
export function adzunaAdId(url: string): string | null {
  return url.match(/adzuna\.[a-z.]+\/(?:details|land\/ad|jobs\/land\/ad)\/(\d+)/i)?.[1] ?? null;
}
