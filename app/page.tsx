import HomePlayMenu from "./HomePlayMenu";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/main-menu-bg.png)" }}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md">
        <HomePlayMenu />
      </div>
    </div>
  );
}
