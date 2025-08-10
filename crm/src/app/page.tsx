import Button from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-56px)]">
      {/* HERO */}
      <section className="container-hero pt-16 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight gradient-title">
              Build secure, cookie-free experiences at enterprise scale
            </h1>
            <p className="mt-5 text-lg opacity-80 max-w-2xl">
              A production-grade starter with Next.js App Router, SQLite durability, and JWT auth. Admin tools, presence, theming, and a
              polished design system accelerate your roadmap.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg">Get Started</Button>
              <Button size="lg" variant="secondary">Live Demo</Button>
            </div>
            <div className="mt-8 flex items-center gap-6 opacity-70 text-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-green-500" />
                <span>Sessions & presence</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                <span>Admin & auditing</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-violet-500" />
                <span>Beautiful UI</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="relative">
              <div className="absolute inset-0 -z-10 blur-3xl opacity-40 bg-gradient-to-tr from-violet-500/30 to-sky-500/30 rounded-3xl" />
              <Card className="overflow-hidden">
                <CardBody className="p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/vercel.svg" alt="preview" className="w-full h-48 sm:h-72 lg:h-80 object-contain bg-gradient-to-b from-black/5 to-transparent dark:from-white/5" />
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container-hero pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'Cookie-free JWT Auth', desc: 'Short-lived access tokens in memory with secure refresh rotation stored locally.' },
            { title: 'SQLite Durability', desc: 'WAL mode optimized for real-world usage with presence and auditing.' },
            { title: 'Admin Excellence', desc: 'User management, role & status controls, with best-in-class safeguards.' },
          ].map((f) => (
            <Card key={f.title}>
              <CardBody>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm opacity-80">{f.desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
