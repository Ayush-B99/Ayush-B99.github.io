import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const PROJECTS = [
  { title: 'Gesture-based drone control', when: '2026', meta: 'COS 301 capstone, Team Codex Merchants',
    body: 'Pilot a drone with bare hands on a standard webcam. I built the computer-vision pipeline (MediaPipe landmarks, rule-based and ML recognisers, a temporal stabiliser, an async WebSocket stream) and the calibration subsystem: a session state machine with REST and WebSocket endpoints, plus a gate that blocks uncalibrated flight commands.',
    tech: 'Python, FastAPI, React, TypeScript, MediaPipe, AirSim, Docker', link: ['See the repository', 'https://github.com/COS301-SE-2026/Gesture-Based-Drone-Control'] },
  { title: 'Universal Acceptance validator', when: '2026', meta: 'Registry.Africa hackathon at UP. Won Best Validator.',
    body: 'A reference email and domain validator that fixes the "three-character TLD" bug locking .africa, .capetown and .joburg addresses out of South African portals. 100% on the competition suite with standard-library Python only: live PSL and IANA root-zone lookups, full Unicode and Punycode, RFC-compliant local parts and sub-addressing.',
    tech: 'Python standard library, IDN and Punycode, DNS', link: ['Covered by MyBroadband', 'https://mybroadband.co.za'] },
  { title: 'CHPC Student Cluster Competition', when: '2026', meta: 'Team UPtime, national finalist',
    body: 'Specified two competing cluster architectures, an R650k baseline at about 8.8 TFLOPS and an EPYC/H100 build at about 100 TFLOPS, with full cost, power and performance justification. Ran HPL on OpenStack to roughly 1,098 GFLOPS with OpenBLAS and profiled the BLAS library as the next lever. Provisioning with Terraform and Ansible; CI through GitHub Actions and CircleCI.',
    tech: 'Linux, OpenMPI, Slurm, Terraform, Ansible, Prometheus' },
  { title: 'Price comparison platform', when: '2025', meta: 'COS 221',
    body: 'Normalised MySQL database with real retail data, a PHP REST API and a responsive JS frontend.',
    tech: 'MySQL, PHP, JavaScript', link: ['See the repository', 'https://github.com/ShavirV/COS-221-Assignment-5'] },
  { title: 'Plant nursery simulator', when: '2025', meta: 'COS 214',
    body: 'C++ simulation built around Gang of Four patterns, with UML, unit tests and documentation.',
    tech: 'C++, UML, unit testing', link: ['See the repository', 'https://github.com/Ayush-B99/COS-214-Final-Project'] }
];

const STEP = 0.6; // viewport-heights of scroll per project on desktop
const wide = () => innerWidth > 900;

// One project open at a time. On desktop the section pins and scrolling
// moves through them; on phones it's a tap-to-open accordion.
export default function Builds() {
  const ref = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const sec = ref.current;
    const n = PROJECTS.length;
    const layout = () => { sec.style.height = wide() ? `${innerHeight * (1 + STEP * (n - 1))}px` : ''; update(); };
    const update = () => {
      if (!wide()) return;
      const p = Math.min(1, Math.max(0, (scrollY - sec.offsetTop) / Math.max(1, sec.offsetHeight - innerHeight)));
      setActive(Math.round(p * (n - 1)));
    };
    layout();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', layout);
    return () => { removeEventListener('scroll', update); removeEventListener('resize', layout); };
  }, []);

  const pick = i => {
    const sec = ref.current;
    if (wide()) scrollTo({ top: sec.offsetTop + (i / (PROJECTS.length - 1)) * (sec.offsetHeight - innerHeight), behavior: 'smooth' });
    setActive(active === i && !wide() ? -1 : i);
  };

  return (
    <section id="builds" className="stack" ref={ref}>
      <div className="pin">
        <div className="pin-head">
          <h2>Things I've built</h2>
          <p className="muted pin-note">Scroll, or tap a title</p>
        </div>
        <div className="acc-stack">
          {PROJECTS.map((p, i) => (
            <article className={`proj${active === i ? ' open' : ''}`} key={p.title}>
              <button className="proj-head" type="button" aria-expanded={active === i} onClick={() => pick(i)}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span className="title">{p.title}</span>
                <span className="when">{p.when}</span>
              </button>
              <AnimatePresence initial={false}>
                {active === i && (
                  <motion.div className="proj-body" key="body"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
                    <div className="proj-inner">
                      <p className="meta">{p.meta}</p>
                      <div className="proj-grid">
                        <p>{p.body}</p>
                        <div className="proj-side">
                          <p className="tech">{p.tech}</p>
                          {p.link && <a className="more" href={p.link[1]}>{p.link[0]}</a>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
