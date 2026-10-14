export type AboutTeamMember = {
  id: string;
  name: string;
  role: string;
  quote: string;
  image: string;
  imagePosition?: string;
  place?: { lat: number; lng: number };
};

const photo = (file: string) => `/images/about/team/${file}` as const;
const blankAvatar = photo("avatar-blank.jpg");

export const aboutTeam = [
  {
    id: "genevieve-leveille",
    name: "Geneviève Leveille",
    role: "Founder & President",
    quote: "Pioneering digital leader advancing technology for climate-vulnerable communities.",
    image: photo("genevieve-leveille.jpg"),
    place: { lat: 40.71, lng: -74.01 },
  },
  {
    id: "tafadzwa-chando",
    name: "Tafadzwa Chando",
    role: "Original Founder",
    quote: "Original founder advancing climate mobility from Zimbabwe to the global stage.",
    image: blankAvatar,
    place: { lat: -17.83, lng: 31.05 },
  },
  {
    id: "taylor-rankin",
    name: "Taylor Rankin",
    role: "Executive Producer",
    quote: "Global producer creating impactful cultural events and experiences.",
    image: photo("taylor-rankin.jpg"),
    place: { lat: 32.3, lng: -64.78 },
  },
  {
    id: "tochukwu-macfoy",
    name: "Dr. Tochukwu Macfoy",
    role: "Creative Director",
    quote: "Creative strategist using art and storytelling for social change.",
    image: photo("tochukwu-macfoy.jpg"),
    place: { lat: 11.2, lng: 12.0 },
  },
  {
    id: "sthella-ngolet",
    name: "Sthella Ngolet",
    role: "Francophone Programs Advocate",
    quote: "Connecting Francophone communities with global climate action.",
    image: photo("sthella-ngolet.jpg"),
    place: { lat: 0.39, lng: 9.45 },
  },
  {
    id: "gemma-gutierrez",
    name: "Gemma Gutierrez",
    role: "Youth Programs",
    quote: "Youth advocate empowering the next generation of climate leaders.",
    image: photo("gemma-gutierrez.jpg"),
    place: { lat: 40.71, lng: -74.01 },
  },
  {
    id: "analyah-dos-santos",
    name: "Analyah dos Santos",
    role: "Climate Programming",
    quote: "Climate researcher advancing adaptation and humanitarian solutions.",
    image: photo("analyah-dos-santos.jpg"),
    place: { lat: 40.71, lng: -74.01 },
  },
  {
    id: "stefania-passamonte",
    name: "Stefania Passamonte",
    role: "In-house Counsel",
    quote: "International counsel guiding governance, compliance, and partnerships.",
    image: photo("stefania-passamonte.jpg"),
    imagePosition: "center 12%",
    place: { lat: 51.51, lng: -0.13 },
  },
  {
    id: "nathan-khrupalo",
    name: "Nathan Khrupalo",
    role: "Sponsors Relations Director",
    quote: "Partnership leader connecting global capital with climate action.",
    image: photo("nathan-khrupalo.jpg"),
  },
  {
    id: "joseph-raymond-hammond",
    name: "Joseph Raymond Hammond",
    role: "Program Director",
    quote: "Program leader shaping global policy and development forums.",
    image: photo("joseph-raymond-hammond.jpg"),
    place: { lat: 5.6, lng: -0.19 },
  },
  {
    id: "sutu-campbell",
    name: "Sutu Campbell",
    role: "Interactive Experience Advisor",
    quote: "Award-winning artist pioneering immersive digital storytelling.",
    image: photo("sutu-campbell.jpg"),
    place: { lat: -33.87, lng: 151.21 },
  },
  {
    id: "anirudha-ghosh",
    name: "Anirudha Ghosh",
    role: "UX Designer",
    quote: "Product designer creating intuitive, accessible digital experiences.",
    image: photo("anirudha-ghosh.jpg"),
    place: { lat: 22.6, lng: 79.0 },
  },
  {
    id: "faithful-kobina-quayson",
    name: "Faithful Kobina Quayson",
    role: "Web Developer",
    quote: "Web developer converting curated designs into functional web products.",
    image: photo("faithful-kobina-quayson.jpg"),
    place: { lat: 6.8, lng: -2.0 },
  },
  {
    id: "rowland-jones",
    name: "Rowland Jones",
    role: "Head of Technology",
    quote: "Technology strategist powering secure, connected global experiences.",
    image: photo("rowland-jones.jpg"),
    place: { lat: 5.6, lng: -0.19 },
  },
  {
    id: "brett-aldridge",
    name: "Brett Aldridge",
    role: "Team member",
    quote: "…",
    image: blankAvatar,
  },
  {
    id: "chiamaka-chukwudi",
    name: "Chiamaka Chukwudi",
    role: "Production Coordinator",
    quote: "Production coordinator delivering complex international events.",
    image: blankAvatar,
    place: { lat: 7.4, lng: 4.2 },
  },
  {
    id: "oyelese-oreoluwa-daniel",
    name: "Oyelese Oreoluwa Daniel",
    role: "Event Coordinator",
    quote: "Event coordinator ensuring smooth logistics and delegate experiences.",
    image: blankAvatar,
    place: { lat: 10.4, lng: 10.2 },
  },
  {
    id: "danielle-kyony",
    name: "Danielle Kyony",
    role: "Intern & Volunteer Coordinator",
    quote: "Emerging advocate mobilizing volunteers for climate justice.",
    image: photo("danielle-kyony.jpg"),
    place: { lat: -26.2, lng: 28.05 },
  },
  {
    id: "angel-mordi",
    name: "Angel Mordi",
    role: "Social Media Manager",
    quote:
      "Digital storyteller focused on turning ideas into clear, engaging content that connects brands with their audiences.",
    image: photo("angel-mordi.jpg"),
    place: { lat: 9.4, lng: 8.4 },
  },
  {
    id: "gift-adedayo",
    name: "Gift Adedayo",
    role: "Brand Designer",
    quote: "Designer who loves turning ideas into clear visual solutions.",
    image: photo("gift-adedayo.jpg"),
    place: { lat: 8.6, lng: 6.4 },
  },
  {
    id: "naquetta-ricks",
    name: "Naquetta Ricks",
    role: "member",
    quote: "...",
    image: photo("naquetta-ricks.jpg"),
    place: { lat: 39.83, lng: -98.58 },
  },
  // {
  //   id: "vanessa-helou",
  //   name: "Vanessa Helou",
  //   role: "Coordinating Producer",
  //   quote: "Creative producer coordinating global events, partners, and media.",
  //   image: photo("vanessa-helou.jpg"),
  // },
  // {
  //   id: "mehdi-yann",
  //   name: "Mehdi Yann",
  //   role: "Team member",
  //   quote: "…",
  //   image: photo("mehdi-yann.jpg"),
  // },
  // {
  //   id: "kim-dauthel",
  //   name: "Kim Dauthel",
  //   role: "Team member",
  //   quote: "…",
  //   image: photo("kim-dauthel.jpg"),
  // },
] as const satisfies readonly AboutTeamMember[];
