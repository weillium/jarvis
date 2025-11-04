'use client';

import { useAuth } from '@/shared/hooks/use-auth';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <div style={{
        marginBottom: '32px',
      }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#0f172a',
          margin: '0 0 8px 0',
          letterSpacing: '-0.5px',
        }}>
          Profile
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#64748b',
          margin: 0,
        }}>
          Manage your account settings and preferences
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '24px',
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 24px 0',
          }}>
            Account Information
          </h2>

          <div style={{
            marginBottom: '24px',
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Email Address
            </label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '15px',
                background: '#f8fafc',
                color: '#64748b',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{
            marginBottom: '24px',
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Full Name
            </label>
            <input
              type="text"
              placeholder="Enter your full name"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{
            marginBottom: '24px',
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Institution
            </label>
            <input
              type="text"
              placeholder="Enter your institution"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '15px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{
            marginBottom: '24px',
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Role
            </label>
            <select style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '15px',
              background: '#ffffff',
              boxSizing: 'border-box',
            }}>
              <option>Select role...</option>
              {/* Placeholder: Role options */}
              <option>Event Organizer</option>
              <option>Researcher</option>
              <option>Administrator</option>
            </select>
          </div>

          <button style={{
            background: '#1e293b',
            color: '#ffffff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}>
            {/* Placeholder: Save profile function */}
            Save Changes
          </button>
        </div>

        <div>
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 24px 0',
            }}>
              Security
            </h2>

            <div style={{
              marginBottom: '20px',
            }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px',
              }}>
                Current Password
              </label>
              <input
                type="password"
                placeholder="Enter current password"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{
              marginBottom: '20px',
            }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px',
              }}>
                New Password
              </label>
              <input
                type="password"
                placeholder="Enter new password"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '500',
              background: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
            }}>
              {/* Placeholder: Update password function */}
              Update Password
            </button>
          </div>

          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '24px',
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 16px 0',
            }}>
              Preferences
            </h2>

            <div style={{
              marginBottom: '16px',
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '15px',
                color: '#374151',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                Email notifications
              </label>
            </div>

            <div style={{
              marginBottom: '16px',
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '15px',
                color: '#374151',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                Weekly summaries
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

