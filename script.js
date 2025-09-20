const state={units:'metric',weather:null,place:null,selectedDate:null};
const el=s=>document.querySelector(s);
const hourlyVars=['temperature_2m','apparent_temperature','relativehumidity_2m','precipitation','weathercode','uv_index','visibility','windspeed_10m','pressure_msl'].join(',');
const dailyVars=['temperature_2m_max','temperature_2m_min','sunrise','sunset'].join(',');
const apiBase='https://api.open-meteo.com/v1/forecast';

// Loading
function loading(show){el('#loadingOverlay').style.display=show?'flex':'none';}

// Formatters
function formatTemp(c){return c==null?'--':state.units==='metric'?`${Math.round(c)}°C`:`${Math.round(c*9/5+32)}°F`;}
function formatWind(kmh){return kmh==null?'--':state.units==='metric'?`${Math.round(kmh)} km/h`:`${Math.round(kmh/1.60934)} mph`;}
function formatPrecip(mm){return mm==null?'--':state.units==='metric'?`${mm} mm`:`${(mm/25.4).toFixed(2)} in`;}
function setText(sel,txt){const n=el(sel);if(n)n.textContent=txt;}

// SVG mapping by temperature and day/night
function getSVG(temp) {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour < 18; // Day: 6AM–6PM

  if (temp <= -10) return "🥶";          // Extreme cold
  if (temp <= 4) return isDay ? "❄️" : "🌙❄️";   // Freezing
  if (temp <= 10) return isDay ? "🌤️" : "🌙☁️";  // Cold but mild
  if (temp <= 20) return isDay ? "⛅" : "🌙";     // Pleasant / Cool
  if (temp <= 28) return isDay ? "☀️" : "🌙⭐";   // Warm
  if (temp <= 35) return isDay ? "🌞" : "🌙🔥";   // Hot
  if (temp <= 40) return "🔥";                    // Very hot
  return "🌡️";                                  // Extreme heat
}


// Fetch weather
async function fetchWeather(lat,lon){
loading(true);
try{
const url=`${apiBase}?latitude=${lat}&longitude=${lon}&hourly=${hourlyVars}&daily=${dailyVars}&current_weather=true&timezone=auto&windspeed_unit=kmh`;
const r=await fetch(url);
const w=await r.json();
state.weather=w;
state.selectedDate=w.daily?.time?.[0];
renderAll();
}catch(e){console.error(e);alert('Weather fetch failed');}
finally{loading(false);}
}

// Render
function renderAll() {
  const w = state.weather;
  if (!w) return;
  const cur = w.current_weather;

  // Always show proper city name if available
  setText("#cityName", state.place?.name || `${w.latitude.toFixed(2)},${w.longitude.toFixed(2)}`);

  setText("#currentDate", new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "short", day: "numeric"
  }));

  setText("#tempNow", formatTemp(cur.temperature));
  el("#heroSVG").textContent = getSVG(cur.temperature);
  setText("#condText", getSVG(cur.temperature));
  setText("#feelsLike", formatTemp(w.hourly?.apparent_temperature?.[0] ?? cur.temperature));
  setText("#humidity", Math.round(w.hourly?.relativehumidity_2m?.[0] ?? 0) + "%");
  setText("#wind", formatWind(cur.windspeed));
  setText("#precip", formatPrecip(w.hourly?.precipitation?.[0] ?? 0));

  renderDailyCards();
  renderHourlyForDate(state.selectedDate);
}


// Daily
function renderDailyCards(){
const container=el('#dailyRow');container.innerHTML='';
const daily=state.weather.daily;if(!daily)return;
daily.time.forEach((d,i)=>{
const div=document.createElement('div');div.className='day-card'+(d===state.selectedDate?' active':'');
const hi=Math.round(daily.temperature_2m_max[i]),lo=Math.round(daily.temperature_2m_min[i]);
div.innerHTML=`<div class="dayname">${new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'})}</div>
<div class="date-small">${new Date(d+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>
<div class="temps">${hi}° / ${lo}°</div>`;
div.addEventListener('click',()=>{state.selectedDate=d;renderDailyCards();renderHourlyForDate(d);});
container.appendChild(div);
});
}

// Hourly
function renderHourlyForDate(dateStr){
  setText('#selectedDayLabel',
    dateStr ? new Date(dateStr+'T00:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : '—'
  );

  const hourlyList = el('#hourlyList');
  hourlyList.innerHTML = '';
  if(!dateStr || !state.weather) return;

  const times = state.weather.hourly.time;
  const now = new Date().getTime();
  let indices = [];

  for(let i=0;i<times.length;i++){
    if(times[i].startsWith(dateStr) && new Date(times[i]).getTime() >= now){
      indices.push(i);
    }
  }

  if(indices.length===0){
    hourlyList.innerHTML = '<div class="muted">No hourly data</div>';
    return;
  }

  indices.forEach(i=>{
    const row = document.createElement('div');
    row.className = 'hourly-row';

    const tLabel = new Date(state.weather.hourly.time[i]).toLocaleTimeString([], {hour:'numeric',hour12:true});
    const t = formatTemp(state.weather.hourly.temperature_2m[i]);

    row.innerHTML = `
      <div>${tLabel}</div>
      <div>${getSVG(state.weather.hourly.temperature_2m[i])}</div>
      <div class="temp-small">${t}</div>
    `;

    hourlyList.appendChild(row);
  });
}


// Autocomplete
const searchInput=el('#searchInput');const suggestions=el('#suggestions');
searchInput.addEventListener('input',async()=>{
const q=searchInput.value.trim();suggestions.innerHTML='';if(!q)return;
try{const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`);
const data=await r.json();if(!data.results)return;
data.results.forEach(place=>{
const div=document.createElement('div');div.textContent=`${place.name}, ${place.country}`;
div.addEventListener('click',()=>{state.place=place;fetchWeather(place.latitude,place.longitude);suggestions.innerHTML='';searchInput.value=place.name;});
suggestions.appendChild(div);
});
}catch(e){console.error(e);}
});

el('#searchBtn').addEventListener('click',async()=>{
const q=searchInput.value.trim();if(!q)return;
const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
const d=await r.json();if(!d.results?.[0])return alert('Place not found');state.place=d.results[0];fetchWeather(state.place.latitude,state.place.longitude);
});

// Units
el('#unitToggle').addEventListener('click',()=>{
state.units=state.units==='metric'?'imperial':'metric';el('#unitToggle').textContent=`Units: ${state.units==='metric'?'°C':'°F'}`;renderAll();
});

// Geolocation
if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(async pos=>{
    loading(true);
    try{
      const rev = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&count=1`);
      const data = await rev.json();
      state.place = data.results?.[0] || {name:'Your location'};
    } catch(e){
      state.place = {name:'Your location'};
    }
    await fetchWeather(pos.coords.latitude,pos.coords.longitude);
    renderAll(); // ensure frontend updates with city name
    loading(false);
  }, ()=>{
    state.place = {name:'New York'};
    fetchWeather(40.7128,-74.0060);
  });
}else{
  state.place = {name:'New York'};
  fetchWeather(40.7128,-74.0060);
}
