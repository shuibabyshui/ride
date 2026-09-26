const HOME = "20020 Rodrigues Ave, Cupertino, CA 95014";
const HOME_COORD = [37.320471, -122.024028];
const routes = {
  regnart: ["Wilson Park, Cupertino, CA","Creekside Park, Cupertino, CA","McClellan Rd & S De Anza Blvd, Cupertino, CA"],
  blackberry: ["McClellan Ranch Preserve, Cupertino, CA","Blackberry Farm Park, Cupertino, CA","Stevens Creek Trail, Cupertino, CA"],
  apple: ["Creekside Park, Cupertino, CA","Apple Park Visitor Center, Cupertino, CA","Portal Park, Cupertino, CA"],
  mary: ["Cupertino Memorial Park, Cupertino, CA","Lawson Middle School, Cupertino, CA","Mary Avenue Bicycle Footbridge, Cupertino, CA"]
};
const appleWaypoints = {
  regnart: [[37.316920,-122.015625],[37.320662,-122.019779]],
  blackberry: [[37.313493,-122.063536],[37.314020,-122.063287]],
  apple: [[37.322961,-122.007739],[37.323059,-122.008659]],
  mary: [[37.326726,-122.027664],[37.335616,-122.050621]]
};

function googleUrl(points) {
  const p = new URLSearchParams({api:"1",origin:HOME,destination:HOME,travelmode:"bicycling",waypoints:points.join("|")});
  return `https://www.google.com/maps/dir/?${p}`;
}
function appleUrl(route) {
  const parts = [`source=${HOME_COORD.join(",")}`,`destination=${HOME_COORD.join(",")}`];
  appleWaypoints[route].forEach(point => parts.push(`waypoint=${point.join(",")}`));
  parts.push("mode=cycling","avoid=busy-roads");
  return `https://maps.apple.com/directions?${parts.join("&")}`;
}

document.querySelectorAll(".map-button").forEach(link => {
  const points = routes[link.dataset.route];
  link.href = link.dataset.provider === "apple" ? appleUrl(link.dataset.route) : googleUrl(points);
  link.target = "_blank"; link.rel = "noopener noreferrer";
});
const filterStatus = document.querySelector(".filter-status");
const filterLabels = {all:"全部",quiet:"少车",scenic:"风景"};
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click",() => {
  const selected = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(item => {
    const active = item === button;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  });
  const cards = [...document.querySelectorAll(".route-card")];
  let visibleCount = 0;
  cards.forEach(card => {
    const tags = card.dataset.tags.split(" ");
    const visible = selected === "all" || tags.includes(selected);
    card.hidden = !visible;
    card.classList.toggle("hidden",!visible);
    if (visible) visibleCount += 1;
  });
  filterStatus.textContent = `${filterLabels[selected]} · ${visibleCount} 条路线`;
  filterStatus.classList.add("show");
  clearTimeout(window.filterStatusTimer);
  window.filterStatusTimer = setTimeout(() => filterStatus.classList.remove("show"),1600);
  const first = cards.find(card => !card.hidden);
  first?.scrollIntoView({behavior:"smooth",block:"start"});
  requestAnimationFrame(() => Object.values(maps).forEach(map => map.invalidateSize()));
}));

const maps = {};
const photoLayers = {};
const lightbox = document.querySelector(".photo-lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector("p");
function showPhoto(url,created) {
  lightboxImage.src = url;
  lightboxCaption.textContent = new Date(created).toLocaleString();
  lightbox.showModal();
}
lightbox.querySelector(".lightbox-close").addEventListener("click",() => lightbox.close());
lightbox.addEventListener("click",event => { if (event.target === lightbox) lightbox.close(); });
const homeIcon = L.divIcon({className:"",html:'<div class="home-marker" title="家"></div>',iconSize:[18,18],iconAnchor:[9,9]});
async function initMap(route) {
  const map = L.map(`map-${route}`,{zoomControl:false,scrollWheelZoom:false,attributionControl:true});
  L.control.zoom({position:"bottomright"}).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
  const data = await fetch(`${route}.geojson`).then(r => r.json());
  const line = L.geoJSON(data,{style:{color:"#17382f",weight:5,opacity:.9}}).addTo(map);
  L.marker(HOME_COORD,{icon:homeIcon}).addTo(map).bindTooltip("家");
  photoLayers[route] = L.layerGroup().addTo(map);
  map.fitBounds(line.getBounds(),{padding:[18,18]});
  maps[route] = map;
  await loadPhotos(route).catch(() => {});
}
Object.keys(routes).forEach(route => initMap(route).catch(() => {
  document.querySelector(`#map-${route}`).innerHTML = '<p class="map-error">地图暂时无法载入，请直接打开地图 App。</p>';
}));

async function getPhotos(route) {
  const response = await fetch(`/api/photos?route=${encodeURIComponent(route)}`);
  if (!response.ok) throw new Error("load failed");
  return response.json();
}
function addPhotoMarker(route,photo) {
  const url = photo.url;
  const icon = L.divIcon({className:"",html:`<img class="photo-marker" src="${url}" alt="骑行照片">`,iconSize:[40,40],iconAnchor:[20,20]});
  L.marker([photo.lat,photo.lon],{icon}).addTo(photoLayers[route]).on("click",() => showPhoto(url,photo.created));
}
async function loadPhotos(route) { (await getPhotos(route)).forEach(photo => addPhotoMarker(route,photo)); }
function compressPhoto(file) {
  return new Promise((resolve,reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1,1600 / Math.max(image.width,image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(source);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("compress failed")),"image/webp",.82);
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("decode failed")); };
    image.src = source;
  });
}
async function uploadPhoto(route,file,gps) {
  const blob = await compressPhoto(file);
  const response = await fetch("/api/photos",{
    method:"POST",body:blob,
    headers:{"content-type":"image/webp","x-route":route,"x-lat":String(gps.latitude),"x-lon":String(gps.longitude)}
  });
  if (!response.ok) throw new Error("upload failed");
  return response.json();
}
function currentPosition() {
  return new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000}));
}
document.querySelectorAll(".photo-input").forEach(input => input.addEventListener("change",async () => {
  const files = [...(input.files || [])]; if (!files.length) return;
  const route = input.dataset.route;
  const status = input.closest(".route-card").querySelector(".photo-status");
  input.disabled = true;
  let uploaded = 0, missingGps = 0, failed = 0, fallbackGps;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      status.textContent = `正在处理 ${index + 1}/${files.length}：读取照片 GPS…`;
      try {
        let gps = await exifr.gps(file);
        if (!Number.isFinite(gps?.latitude) || !Number.isFinite(gps?.longitude)) {
          missingGps += 1;
          if (!fallbackGps) {
            status.textContent = `第 ${index + 1} 张没有 GPS，正在获取手机当前位置…`;
            const pos = await currentPosition();
            fallbackGps = {latitude:pos.coords.latitude,longitude:pos.coords.longitude};
          }
          gps = fallbackGps;
        }
        status.textContent = `正在上传 ${index + 1}/${files.length}…`;
        const photo = await uploadPhoto(route,file,gps);
        addPhotoMarker(route,photo);
        uploaded += 1;
      } catch { failed += 1; }
    }
    if (uploaded) {
      const bounds = photoLayers[route].getBounds?.();
      if (bounds?.isValid()) maps[route].fitBounds(bounds.pad(.25),{maxZoom:16});
    }
    const notes = [`成功 ${uploaded} 张`];
    if (missingGps) notes.push(`${missingGps} 张无 GPS，使用手机当前位置`);
    if (failed) notes.push(`失败 ${failed} 张`);
    status.textContent = `${notes.join("；")}。点击地图照片可放大。`;
  } finally {
    input.disabled = false;
    input.value = "";
  }
}));
