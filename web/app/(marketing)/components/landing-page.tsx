import Link from "next/link";

export default function LandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(to bottom, #f8fafc 0%, #ffffff 100%)",
    }}>
      {/* Navigation */}
      <nav style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "24px 5%",
        maxWidth: "1400px",
        margin: "0 auto",
      }}>
        <div style={{
          fontSize: "24px",
          fontWeight: "600",
          color: "#1e293b",
          letterSpacing: "-0.5px",
        }}>
          Jarvis
        </div>
        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <Link href="/auth" style={{
            color: "#475569",
            textDecoration: "none",
            fontSize: "15px",
            fontWeight: "500",
            transition: "color 0.2s",
          }}>
            Sign In
          </Link>
          <Link href="/auth" style={{
            background: "#1e293b",
            color: "#ffffff",
            padding: "10px 24px",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "15px",
            fontWeight: "500",
            transition: "background 0.2s",
          }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: "80px 5%",
        maxWidth: "1400px",
        margin: "0 auto",
        textAlign: "center",
      }}>
        <h1 style={{
          fontSize: "clamp(42px, 6vw, 72px)",
          fontWeight: "700",
          color: "#0f172a",
          margin: "0 0 24px 0",
          lineHeight: "1.1",
          letterSpacing: "-1.5px",
        }}>
          Intelligent Context for<br />
          Academic Events
        </h1>
        <p style={{
          fontSize: "clamp(18px, 2vw, 22px)",
          color: "#475569",
          maxWidth: "680px",
          margin: "0 auto 48px",
          lineHeight: "1.6",
        }}>
          Real-time AI agents that understand your event content, provide contextual insights, and enhance engagement for organizers and participants.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth" style={{
            background: "#1e293b",
            color: "#ffffff",
            padding: "16px 32px",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: "500",
            display: "inline-block",
            transition: "background 0.2s, transform 0.1s",
          }}>
            Start Your Event
          </Link>
          <Link href="#features" style={{
            background: "transparent",
            color: "#1e293b",
            padding: "16px 32px",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: "500",
            border: "2px solid #cbd5e1",
            display: "inline-block",
            transition: "border-color 0.2s",
          }}>
            Learn More
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" style={{
        padding: "100px 5%",
        background: "#ffffff",
      }}>
        <div style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}>
          <h2 style={{
            fontSize: "clamp(32px, 4vw, 48px)",
            fontWeight: "600",
            color: "#0f172a",
            textAlign: "center",
            margin: "0 0 64px 0",
            letterSpacing: "-0.5px",
          }}>
            Powerful Features for Event Excellence
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "40px",
            marginTop: "64px",
          }}>
            {[
              {
                title: "Real-Time Context",
                description: "AI agents process live transcripts and provide contextual information as your event unfolds.",
              },
              {
                title: "Intelligent Insights",
                description: "Automatically generate insights, summaries, and connections from event content.",
              },
              {
                title: "Seamless Integration",
                description: "Works with your existing event infrastructure and streaming platforms.",
              },
            ].map((feature, i) => (
              <div key={i} style={{
                padding: "32px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}>
                <h3 style={{
                  fontSize: "22px",
                  fontWeight: "600",
                  color: "#0f172a",
                  margin: "0 0 12px 0",
                }}>
                  {feature.title}
                </h3>
                <p style={{
                  fontSize: "16px",
                  color: "#64748b",
                  lineHeight: "1.6",
                  margin: 0,
                }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section style={{
        padding: "100px 5%",
        background: "#f8fafc",
      }}>
        <div style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}>
          <h2 style={{
            fontSize: "clamp(32px, 4vw, 48px)",
            fontWeight: "600",
            color: "#0f172a",
            textAlign: "center",
            margin: "0 0 24px 0",
            letterSpacing: "-0.5px",
          }}>
            Designed for Academic Excellence
          </h2>
          <p style={{
            fontSize: "20px",
            color: "#64748b",
            textAlign: "center",
            maxWidth: "600px",
            margin: "0 auto 64px",
          }}>
            Built specifically for universities, research institutions, and professional conference organizers.
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "32px",
          }}>
            {[
              "Conference Keynotes",
              "Research Seminars",
              "Academic Workshops",
              "Department Colloquia",
            ].map((useCase, i) => (
              <div key={i} style={{
                padding: "24px",
                background: "#ffffff",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: "18px",
                  fontWeight: "500",
                  color: "#1e293b",
                }}>
                  {useCase}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: "100px 5%",
        background: "#1e293b",
        color: "#ffffff",
      }}>
        <div style={{
          maxWidth: "800px",
          margin: "0 auto",
          textAlign: "center",
        }}>
          <h2 style={{
            fontSize: "clamp(36px, 5vw, 52px)",
            fontWeight: "600",
            margin: "0 0 24px 0",
            letterSpacing: "-0.5px",
          }}>
            Ready to Transform Your Events?
          </h2>
          <p style={{
            fontSize: "20px",
            color: "#cbd5e1",
            margin: "0 0 40px 0",
            lineHeight: "1.6",
          }}>
            Join leading institutions using Jarvis to deliver exceptional event experiences.
          </p>
          <Link href="/auth" style={{
            background: "#ffffff",
            color: "#1e293b",
            padding: "16px 40px",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: "500",
            display: "inline-block",
            transition: "transform 0.1s",
          }}>
            Get Started Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: "48px 5%",
        background: "#0f172a",
        color: "#94a3b8",
      }}>
        <div style={{
          maxWidth: "1400px",
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "24px",
        }}>
          <div style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#ffffff",
          }}>
            Jarvis
          </div>
          <div style={{
            fontSize: "14px",
            color: "#64748b",
          }}>
            © {new Date().getFullYear()} Jarvis. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

