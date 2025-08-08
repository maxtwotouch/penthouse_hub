import { route, index } from "@react-router/dev/routes";

export default [
  route("", "routes/layout.tsx", [
    index("routes/home.tsx"),
    route("bus", "routes/bus.tsx"),
    route("weather", "routes/weather.tsx"),
    route("vaskeliste", "routes/vaskeliste.tsx"),
  ]),
];
