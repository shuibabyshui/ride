import { list, put } from "@vercel/blob";

const ROUTES = new Set(["regnart","blackberry","apple","mary"]);

export default async function handler(req,res) {
  if (req.method === "GET") {
    const route = String(req.query.route || "");
    if (!ROUTES.has(route)) return res.status(400).json({error:"Invalid route"});
    const { blobs } = await list({prefix:`rides/${route}/`,limit:1000});
    const photos = blobs.map(blob => {
      const name = blob.pathname.split("/").pop().replace(/\.webp$/i,"");
      const [lat,lon,created] = name.split("_").map(Number);
      return {route,url:blob.url,lat,lon,created:created || new Date(blob.uploadedAt).getTime()};
    }).filter(photo => Number.isFinite(photo.lat) && Number.isFinite(photo.lon));
    return res.status(200).json(photos);
  }
  if (req.method === "POST") {
    const origin = req.headers.origin || "";
    if (origin && !/^https:\/\/(ride\.willll\.com|ride-v\d+\.vercel\.app)$/.test(origin)) return res.status(403).json({error:"Origin denied"});
    const route = String(req.headers["x-route"] || "");
    const lat = Number(req.headers["x-lat"]), lon = Number(req.headers["x-lon"]);
    const length = Number(req.headers["content-length"] || 0);
    if (!ROUTES.has(route) || !Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({error:"Invalid metadata"});
    if (length > 4_000_000) return res.status(413).json({error:"Photo too large"});
    const created = Date.now();
    const pathname = `rides/${route}/${lat}_${lon}_${created}.webp`;
    const blob = await put(pathname,req,{access:"public",contentType:"image/webp",addRandomSuffix:false});
    return res.status(200).json({route,url:blob.url,lat,lon,created});
  }
  res.setHeader("Allow","GET, POST");
  return res.status(405).json({error:"Method not allowed"});
}

export const config = { api: { bodyParser: false } };
