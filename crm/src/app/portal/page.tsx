"use client";
import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import {
  IconSearch,
  IconMessage,
  IconBook2,
  IconSend,
  IconRobot,
  IconX,
} from "@tabler/icons-react";

type Article = {
  id: number;
  title: string;
  category: string;
  excerpt: string;
};

const KB: Article[] = [
  { id: 1, title: "Getting Started with Your Account", category: "Account", excerpt: "Learn how to set up your profile, preferences, and notifications." },
  { id: 2, title: "Billing & Invoices", category: "Billing", excerpt: "Understand invoices, payments, and refunds." },
  { id: 3, title: "Integrations Overview", category: "Integrations", excerpt: "Connect your favorite tools for a seamless workflow." },
  { id: 4, title: "Security Best Practices", category: "Security", excerpt: "Keep your data safe with these recommendations." },
  { id: 5, title: "Troubleshooting Common Issues", category: "Support", excerpt: "Quick fixes to common problems and FAQs." },
];

export default function CustomerPortalPage() {
  const [q, setQ] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const filtered = useMemo(() => KB.filter(a => a.title.toLowerCase().includes(q.toLowerCase()) || a.excerpt.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Customer Portal</h1>
          <p className="opacity-70">Knowledge base, support message, and AI chat assistant</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Knowledge Base */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Knowledge Base" subtitle="Search articles and guides" />
            <CardBody>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Input placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} />
                  <IconSearch className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60" size={18} />
                </div>
                <Button variant="secondary"><IconBook2 size={18} className="mr-2" />Browse</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map(a => (
                  <div key={a.id} className="p-4 rounded-lg border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                    <div className="text-xs opacity-70 mb-1">{a.category}</div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-sm opacity-80 mt-1">{a.excerpt}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Send a Message" subtitle="We’ll respond by email or phone" />
            <CardBody>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Your name" />
                <Input placeholder="Your email" type="email" />
                <Input placeholder="Your phone" className="md:col-span-2" />
                <input className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 md:col-span-2" placeholder="How can we help?" />
                <div className="md:col-span-2 flex justify-end">
                  <Button><IconSend size={18} className="mr-2" />Send</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar: Quick Links / Contact */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Quick Links" />
            <CardBody>
              <ul className="space-y-2 text-sm">
                <li className="hover:underline cursor-pointer">Account Settings</li>
                <li className="hover:underline cursor-pointer">Billing & Invoices</li>
                <li className="hover:underline cursor-pointer">Security & Privacy</li>
                <li className="hover:underline cursor-pointer">Report an Issue</li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <CardBody>
              <div className="text-sm opacity-80">Need help? Start a chat or send us a message.</div>
              <Button className="mt-3" variant="secondary"><IconMessage size={18} className="mr-2" />Open Support</Button>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Floating Chatbot */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 size-12 rounded-full shadow-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center"
        aria-label="Open chat"
      >
        <IconRobot />
      </button>

      {chatOpen && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChatOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-gray-950 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2 font-medium"><IconRobot />AI Assistant</div>
              <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"><IconX size={18} /></button>
            </div>
            <div className="h-64 overflow-auto p-4 space-y-3 text-sm">
              <div className="opacity-70">Assistant is ready to help. Ask a question or describe your issue.</div>
              <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 max-w-[80%]">How do I integrate with Zapier?</div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 ml-auto max-w-[80%]">You can enable Zapier from Integrations and follow the setup guide.</div>
            </div>
            <div className="p-3 border-t border-black/5 dark:border-white/5 flex items-center gap-2">
              <Input placeholder="Type your message..." className="flex-1" />
              <Button><IconSend size={18} className="mr-2" />Send</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


