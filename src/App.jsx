import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Scene from './Scene.jsx';
import Builds from './Builds.jsx';
import BlurText from './bits/BlurText.jsx';
import CountUp from './bits/CountUp.jsx';
import Magnet from './bits/Magnet.jsx';
import ClickSpark from './bits/ClickSpark.jsx';
import SpotlightCard from './bits/SpotlightCard.jsx';
import ShinyText from './bits/ShinyText.jsx';

const SKILLS = [
  ['Python', 'lang'], ['TypeScript', 'lang front'], ['JavaScript', 'lang front'], ['Java', 'lang back'], ['C++', 'lang'], ['C#', 'lang'], ['PHP', 'lang back'], ['SQL', 'lang data'], ['R', 'lang'], ['Assembly', 'lang'],
  ['React', 'front'], ['Next.js', 'front'], ['Angular', 'front'], ['HTML', 'front'], ['CSS', 'front'], ['Tailwind', 'front'], ['Three.js', 'front'],
  ['FastAPI', 'back'], ['Node.js', 'back'], ['NestJS', 'back'], ['Django', 'back'], ['Spring Boot', 'back'], ['REST design', 'back'], ['WebSockets', 'back'],
  ['PostgreSQL', 'data'], ['MySQL', 'data'], ['MariaDB', 'data'], ['Database design', 'data'],
  ['MediaPipe', 'ml'], ['PyTorch', 'ml'], ['OpenCV', 'ml'], ['Neural networks', 'ml'], ['Genetic algorithms', 'ml'],
  ['Git', 'ops'], ['GitHub Actions', 'ops'], ['Docker', 'ops'], ['Terraform', 'ops'], ['Ansible', 'ops'], ['CircleCI', 'ops'], ['Linux', 'ops'], ['Slurm', 'ops'], ['OpenMPI', 'ops'],
  ['pytest', 'tools'], ['Jest', 'tools'], ['JUnit', 'tools'], ['Postman', 'tools'], ['WordPress', 'tools'], ['WooCommerce', 'tools'], ['Figma', 'tools'], ['Unity', 'tools'], ['Blender', 'tools']
];
const CATS = [['lang', 'Languages'], ['front', 'Frontend'], ['back', 'Backend'], ['data', 'Data'], ['ml', 'ML and vision'], ['ops', 'DevOps and HPC'], ['tools', 'Testing and tools']];
const ABOUT = {
  eng: 'Two years shipping production websites for a digital agency while finishing a CS degree. Comfortable anywhere in the stack, happiest in backend systems, computer vision and high-performance computing.',
  mus: "Electric and acoustic guitar, and piano. Mostly by ear, sometimes by sheet, always too loud. It's where the patience for debugging comes from.",
  bld: 'A long-running Nissan 180SX project with a Rocket Bunny V2 kit: the one on this page. Bodywork, wiring, and learning the hard way that every bolt has a story.'
};
const WORK = [
  ['Five client sites, end to end', 'Scope, quote, build, hosting and handover for five client websites. All of them are still in production today.'],
  ['A cybersecurity platform in vanilla HTML, CSS and JS', 'Bespoke components for a multi-page platform: canvas animations, scroll-linked sections, an interactive SVG map of Africa and a modular service selector. No framework, no build step.'],
  ['Replacing site search with zero downtime', 'Swapped out a WordPress site-search subsystem, including a full data migration, without taking the site offline.'],
  ['A multi-day job that now takes under an hour', 'Automated WooCommerce catalogue and bulk price updates with Python scrapers and CSV pipelines.']
];

const Reveal = ({ children, delay = 0, className }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}>
    {children}
  </motion.div>
);

export default function App() {
  const [progress, setProgress] = useState(0);
  const [parked, setParked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState('eng');
  const [job, setJob] = useState(0);
  const [cat, setCat] = useState(null);
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText('ayush.beekum@gmail.com'); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <ClickSpark sparkColor="#ff4b5c" sparkSize={9} sparkRadius={18} sparkCount={8} duration={420}>
      <Scene onProgress={setProgress} onParked={() => setParked(true)} onError={() => { setFailed(true); setParked(true); }} />

      <nav className="nav" aria-label="Site">
        <a className="wordmark" href="#top">Ayush Beekum</a>
        <ul>
          <li><a href="#work">Work</a></li>
          <li><a href="#builds">Builds</a></li>
          <li><a href="#skills">Skills</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </nav>

      <main className="page" id="top">
        <header className="hero">
          {!parked && !failed && (
            <div className="loader" style={{ '--p': `${Math.round(progress * 100)}%` }}>Bringing the car round<i /></div>
          )}
          {failed && <div className="loader">The car didn't load. Check assets/models/rb_s13.glb.</div>}
          <div className={`hero-copy${parked ? ' show' : ''}`}>
            {parked && (
              <>
                <span className="tag">Final-year computer science, University of Pretoria</span>
                <h1>
                  <BlurText text="Ayush" delay={90} animateBy="letters" className="blur-line" />
                  <BlurText text="Beekum" delay={90} animateBy="letters" className="blur-line heavy" />
                </h1>
                <p className="lead">
                  <ShinyText text="Backend systems, computer-vision pipelines and the occasional compute cluster." color="#9aa3b2" shineColor="#ffffff" speed={4} />
                </p>
                <p className="lead">A Rocket Bunny 180SX on weekends. That's it, parked on the water.</p>
                <div className="avail">Graduating 2026. <strong>Open to graduate roles,</strong> Pretoria or remote.</div>
                <div className="actions">
                  <Magnet padding={60} magnetStrength={3}><a className="btn" href="mailto:ayush.beekum@gmail.com">Email me</a></Magnet>
                  <Magnet padding={60} magnetStrength={3}><a className="btn ghost" href="https://github.com/Ayush-B99">GitHub</a></Magnet>
                  <Magnet padding={60} magnetStrength={3}><a className="btn ghost" href="/assets/Ayush_Beekum_CV.pdf">CV</a></Magnet>
                </div>
                <div className="stats">
                  <div><div className="n"><CountUp to={270} duration={1.6} />+</div><div className="l">GitHub contributions</div></div>
                  <div><div className="n"><CountUp to={37} duration={1.6} /></div><div className="l">Pull requests merged</div></div>
                  <div><div className="n"><CountUp to={5} duration={1.2} /></div><div className="l">Client sites live</div></div>
                  <div><div className="n"><CountUp to={2} duration={1} /></div><div className="l">National results</div></div>
                </div>
              </>
            )}
          </div>
        </header>

        <section id="about">
          <Reveal className="inner panel">
            <div className="two">
              <div>
                <h2>Who's driving</h2>
                <div className="seg" role="tablist" aria-label="About me">
                  {[['eng', 'Engineer'], ['mus', 'Musician'], ['bld', 'Builder']].map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ position: 'relative' }}>
                      {tab === k && <motion.span layoutId="pill" className="pill" style={{ position: 'absolute', inset: 0, zIndex: -1 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                      {label}
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p key={tab} className="lead" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                    {ABOUT[tab]}
                  </motion.p>
                </AnimatePresence>
              </div>
              <dl className="facts">
                <dt>Studying</dt><dd>BSc Computer Science, final year, University of Pretoria</dd>
                <dt>Daily languages</dt><dd>Python, TypeScript, Java, C++</dd>
                <dt>Focus</dt><dd>Backend, computer vision, HPC</dd>
                <dt>Based in</dt><dd>Pretoria, South Africa</dd>
              </dl>
            </div>
          </Reveal>
        </section>

        <section id="work">
          <Reveal className="inner panel">
            <h2>Web developer, 4IR Digital</h2>
            <p className="meta">Part-time, 2022 to present. Digital agency and cybersecurity services, Pretoria.</p>
            <div className="acc">
              {WORK.map(([t, body], i) => (
                <div className={`acc-item${job === i ? ' open' : ''}`} key={t}>
                  <button className="acc-head" aria-expanded={job === i} onClick={() => setJob(job === i ? -1 : i)}><span>{t}</span><span>+</span></button>
                  <AnimatePresence initial={false}>
                    {job === i && (
                      <motion.div className="acc-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
                        <p>{body}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: '1.8em' }}>Sites I built that are live today</p>
            <ul className="clients">
              <li><a href="https://webachutes.com">WebAchutes</a></li>
              <li><a href="https://zidainvest.com">Zida Invest</a></li>
              <li><a href="https://jarrodwaberski.com">Jarrod Waberski</a></li>
              <li><a href="https://perpetualservices.co.za">Perpetual Services</a></li>
              <li><a href="https://rylogroup.co.za">Rylo Group</a></li>
            </ul>
          </Reveal>
        </section>

        <Builds />

        <section id="skills">
          <Reveal className="inner panel">
            <h2>What I work with</h2>
            <div className="chips" role="group" aria-label="Filter skills">
              {CATS.map(([k, label]) => (
                <button key={k} aria-pressed={cat === k} onClick={() => setCat(cat === k ? null : k)}>{label}</button>
              ))}
            </div>
            <div className="cloud">
              {SKILLS.map(([name, cats]) => {
                const hit = cat && cats.split(' ').includes(cat);
                return (
                  <motion.span key={name} animate={{ opacity: !cat || hit ? 1 : 0.18, color: hit ? '#ff4b5c' : '#f2f3f5', scale: hit ? 1.04 : 1 }} transition={{ duration: 0.3 }}>
                    {name}
                  </motion.span>
                );
              })}
            </div>
          </Reveal>
        </section>

        <section id="awards">
          <div className="inner">
            <Reveal><h2>Recognition</h2></Reveal>
            <div className="awards">
              {[
                ['Best Validator', 'Universal Acceptance Hackathon, Registry.Africa at the University of Pretoria, July 2026. Perfect score on the competition test suite.'],
                ['National finalist', 'CHPC Student Cluster Competition 2026, Team UPtime, representing the University of Pretoria.'],
                ['Open source', '270+ contributions and 37 pull requests across 9 repositories.']
              ].map(([t, body], i) => (
                <Reveal key={t} delay={i * 0.1}>
                  <SpotlightCard className="award-card" spotlightColor="#ff4b5c" intensity={0.22} borderGlow={0.8} theme="dark" style={{ height: '100%' }}>
                    <strong>{t}</strong>
                    <p>{body}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="contact">
          <Reveal className="inner panel">
            <h2>Let's talk</h2>
            <p className="lead">Graduating in 2026 and looking for graduate software roles in backend, computer vision or HPC. Based in Pretoria, happy to work remotely.</p>
            <div className="links">
              <Magnet padding={60} magnetStrength={3}><a className="btn" href="mailto:ayush.beekum@gmail.com">Email me</a></Magnet>
              <Magnet padding={60} magnetStrength={3}><button className="btn ghost" type="button" onClick={copyEmail}>{copied ? 'Copied' : 'Copy address'}</button></Magnet>
              <a href="/assets/Ayush_Beekum_CV.pdf">Download CV</a>
              <a href="https://github.com/Ayush-B99">GitHub</a>
              <a href="https://www.linkedin.com/in/ayushbeekum-6423862b4">LinkedIn</a>
            </div>
          </Reveal>
        </section>

        <footer>
          <div className="inner">
            © 2026 Ayush Beekum. Car: <a href="https://sketchfab.com/3d-models/2013-rocket-bunny-v2-nissan-s13-240sx-180sx-51eae60217934736887dcf016cde8903">2013 Rocket Bunny V2 Nissan S13</a> by <a href="https://sketchfab.com/ddiaz-design">Ddiaz Design</a>, CC BY-NC-SA 4.0. Built with React, three.js, Motion and <a href="https://reactbits.dev">React Bits</a>. <a href="https://github.com/Ayush-B99/Ayush-B99.github.io">Source</a>
          </div>
        </footer>
      </main>
    </ClickSpark>
  );
}
