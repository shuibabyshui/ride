import { next } from "@vercel/functions";

export default function middleware(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const credentials = atob(header.slice(6));
      const split = credentials.indexOf(":");
      const username = credentials.slice(0,split);
      const password = credentials.slice(split + 1);
      if (username === "ride" && password === process.env.SITE_PASSWORD) return next();
    } catch {}
  }
  return new Response("需要密码才能访问 Rodrigues Rides。",{
    status:401,
    headers:{"WWW-Authenticate":'Basic realm="Rodrigues Rides", charset="UTF-8"',"Cache-Control":"no-store"}
  });
}

export const config = {matcher:["/((?!favicon.ico).*)"]};
