-- CISO CMMC Practices Seed Data
-- All 110 NIST SP 800-171 Rev 2 security requirements
-- Mapped to CMMC Level 2 practice IDs and MMT stack components
-- Idempotent: uses ON CONFLICT DO NOTHING

-- =============================================================================
-- AC: Access Control (22 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('AC.L2-3.1.1', 'AC', 'Access Control', 'Authorized Access Control', 'Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).', 'not_met', 'supabase'),
('AC.L2-3.1.2', 'AC', 'Access Control', 'Transaction & Function Control', 'Limit system access to the types of transactions and functions that authorized users are permitted to execute.', 'not_met', 'supabase'),
('AC.L2-3.1.3', 'AC', 'Access Control', 'Control CUI Flow', 'Control the flow of CUI in accordance with approved authorizations.', 'not_met', 'supabase'),
('AC.L2-3.1.4', 'AC', 'Access Control', 'Separation of Duties', 'Separate the duties of individuals to reduce the risk of malevolent activity without collusion.', 'not_met', 'supabase'),
('AC.L2-3.1.5', 'AC', 'Access Control', 'Least Privilege', 'Employ the principle of least privilege, including for specific security functions and privileged accounts.', 'not_met', 'supabase'),
('AC.L2-3.1.6', 'AC', 'Access Control', 'Non-Privileged Account Use', 'Use non-privileged accounts or roles when accessing nonsecurity functions.', 'not_met', 'supabase'),
('AC.L2-3.1.7', 'AC', 'Access Control', 'Privileged Functions', 'Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.', 'not_met', 'supabase'),
('AC.L2-3.1.8', 'AC', 'Access Control', 'Unsuccessful Logon Attempts', 'Limit unsuccessful logon attempts.', 'not_met', 'supabase'),
('AC.L2-3.1.9', 'AC', 'Access Control', 'Privacy & Security Notices', 'Provide privacy and security notices consistent with applicable CUI rules.', 'not_met', 'netlify'),
('AC.L2-3.1.10', 'AC', 'Access Control', 'Session Lock', 'Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.', 'not_met', 'codebase'),
('AC.L2-3.1.11', 'AC', 'Access Control', 'Session Termination', 'Terminate (automatically) a user session after a defined condition.', 'not_met', 'supabase'),
('AC.L2-3.1.12', 'AC', 'Access Control', 'Control Remote Access', 'Monitor and control remote access sessions.', 'not_met', 'supabase'),
('AC.L2-3.1.13', 'AC', 'Access Control', 'Remote Access Confidentiality', 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.', 'not_met', 'netlify'),
('AC.L2-3.1.14', 'AC', 'Access Control', 'Remote Access Routing', 'Route remote access via managed access control points.', 'not_met', 'netlify'),
('AC.L2-3.1.15', 'AC', 'Access Control', 'Privileged Remote Access', 'Authorize remote execution of privileged commands and remote access to security-relevant information.', 'not_met', 'supabase'),
('AC.L2-3.1.16', 'AC', 'Access Control', 'Wireless Access Authorization', 'Authorize wireless access prior to allowing such connections.', 'not_met', 'not_applicable'),
('AC.L2-3.1.17', 'AC', 'Access Control', 'Wireless Access Protection', 'Protect wireless access using authentication and encryption.', 'not_met', 'not_applicable'),
('AC.L2-3.1.18', 'AC', 'Access Control', 'Mobile Device Connection', 'Control connection of mobile devices.', 'not_met', 'not_applicable'),
('AC.L2-3.1.19', 'AC', 'Access Control', 'Encrypt CUI on Mobile', 'Encrypt CUI on mobile devices and mobile computing platforms.', 'not_met', 'not_applicable'),
('AC.L2-3.1.20', 'AC', 'Access Control', 'External Connections', 'Verify and control/limit connections to and use of external systems.', 'not_met', 'netlify'),
('AC.L2-3.1.21', 'AC', 'Access Control', 'Portable Storage Use', 'Limit use of portable storage devices on external systems.', 'not_met', 'not_applicable'),
('AC.L2-3.1.22', 'AC', 'Access Control', 'Control Public Information', 'Control information posted or processed on publicly accessible systems.', 'not_met', 'netlify')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- AT: Awareness & Training (3 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('AT.L2-3.2.1', 'AT', 'Awareness & Training', 'Role-Based Risk Awareness', 'Ensure that managers, systems administrators, and users of organizational systems are made aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of those systems.', 'not_met', 'codebase'),
('AT.L2-3.2.2', 'AT', 'Awareness & Training', 'Role-Based Training', 'Ensure that personnel are trained to carry out their assigned information security-related duties and responsibilities.', 'not_met', 'codebase'),
('AT.L2-3.2.3', 'AT', 'Awareness & Training', 'Insider Threat Awareness', 'Provide security awareness training on recognizing and reporting potential indicators of insider threat.', 'not_met', 'codebase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- AU: Audit & Accountability (9 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('AU.L2-3.3.1', 'AU', 'Audit & Accountability', 'System Auditing', 'Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.', 'not_met', 'supabase'),
('AU.L2-3.3.2', 'AU', 'Audit & Accountability', 'User Accountability', 'Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions.', 'not_met', 'supabase'),
('AU.L2-3.3.3', 'AU', 'Audit & Accountability', 'Event Review', 'Review and update logged events.', 'not_met', 'supabase'),
('AU.L2-3.3.4', 'AU', 'Audit & Accountability', 'Audit Failure Alerting', 'Alert in the event of an audit logging process failure.', 'not_met', 'sentry'),
('AU.L2-3.3.5', 'AU', 'Audit & Accountability', 'Audit Correlation', 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.', 'not_met', 'supabase'),
('AU.L2-3.3.6', 'AU', 'Audit & Accountability', 'Audit Reduction & Reporting', 'Provide audit record reduction and report generation to support on-demand analysis and reporting.', 'not_met', 'supabase'),
('AU.L2-3.3.7', 'AU', 'Audit & Accountability', 'Authoritative Time Source', 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.', 'not_met', 'supabase'),
('AU.L2-3.3.8', 'AU', 'Audit & Accountability', 'Audit Protection', 'Protect audit information and audit logging tools from unauthorized access, modification, and deletion.', 'not_met', 'supabase'),
('AU.L2-3.3.9', 'AU', 'Audit & Accountability', 'Audit Management', 'Limit management of audit logging functionality to a subset of privileged users.', 'not_met', 'supabase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- CM: Configuration Management (9 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('CM.L2-3.4.1', 'CM', 'Configuration Management', 'System Baselining', 'Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.', 'not_met', 'github'),
('CM.L2-3.4.2', 'CM', 'Configuration Management', 'Security Configuration Enforcement', 'Establish and enforce security configuration settings for information technology products employed in organizational systems.', 'not_met', 'github'),
('CM.L2-3.4.3', 'CM', 'Configuration Management', 'System Change Management', 'Track, review, approve or disapprove, and log changes to organizational systems.', 'not_met', 'github'),
('CM.L2-3.4.4', 'CM', 'Configuration Management', 'Security Impact Analysis', 'Analyze the security impact of changes prior to implementation.', 'not_met', 'github'),
('CM.L2-3.4.5', 'CM', 'Configuration Management', 'Access Restrictions for Change', 'Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.', 'not_met', 'github'),
('CM.L2-3.4.6', 'CM', 'Configuration Management', 'Least Functionality', 'Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.', 'not_met', 'netlify'),
('CM.L2-3.4.7', 'CM', 'Configuration Management', 'Nonessential Functionality', 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.', 'not_met', 'netlify'),
('CM.L2-3.4.8', 'CM', 'Configuration Management', 'Application Execution Policy', 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.', 'not_met', 'netlify'),
('CM.L2-3.4.9', 'CM', 'Configuration Management', 'User-Installed Software', 'Control and monitor user-installed software.', 'not_met', 'github')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- IA: Identification & Authentication (11 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('IA.L2-3.5.1', 'IA', 'Identification & Authentication', 'Identification', 'Identify system users, processes acting on behalf of users, and devices.', 'not_met', 'supabase'),
('IA.L2-3.5.2', 'IA', 'Identification & Authentication', 'Authentication', 'Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.', 'not_met', 'supabase'),
('IA.L2-3.5.3', 'IA', 'Identification & Authentication', 'Multifactor Authentication', 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.', 'not_met', 'supabase'),
('IA.L2-3.5.4', 'IA', 'Identification & Authentication', 'Replay-Resistant Authentication', 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.', 'not_met', 'supabase'),
('IA.L2-3.5.5', 'IA', 'Identification & Authentication', 'Identifier Reuse', 'Prevent reuse of identifiers for a defined period.', 'not_met', 'supabase'),
('IA.L2-3.5.6', 'IA', 'Identification & Authentication', 'Identifier Handling', 'Disable identifiers after a defined period of inactivity.', 'not_met', 'supabase'),
('IA.L2-3.5.7', 'IA', 'Identification & Authentication', 'Password Complexity', 'Enforce a minimum password complexity and change of characters when new passwords are created.', 'not_met', 'supabase'),
('IA.L2-3.5.8', 'IA', 'Identification & Authentication', 'Password Reuse', 'Prohibit password reuse for a specified number of generations.', 'not_met', 'supabase'),
('IA.L2-3.5.9', 'IA', 'Identification & Authentication', 'Temporary Passwords', 'Allow temporary password use for system logons with an immediate change to a permanent password.', 'not_met', 'supabase'),
('IA.L2-3.5.10', 'IA', 'Identification & Authentication', 'Cryptographic Password Protection', 'Store and transmit only cryptographically-protected passwords.', 'not_met', 'supabase'),
('IA.L2-3.5.11', 'IA', 'Identification & Authentication', 'Obscure Feedback', 'Obscure feedback of authentication information.', 'not_met', 'codebase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- IR: Incident Response (3 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('IR.L2-3.6.1', 'IR', 'Incident Response', 'Incident Handling', 'Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities.', 'not_met', 'sentry'),
('IR.L2-3.6.2', 'IR', 'Incident Response', 'Incident Reporting', 'Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.', 'not_met', 'sentry'),
('IR.L2-3.6.3', 'IR', 'Incident Response', 'Incident Response Testing', 'Test the organizational incident response capability.', 'not_met', 'sentry')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- MA: Maintenance (6 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('MA.L2-3.7.1', 'MA', 'Maintenance', 'Perform Maintenance', 'Perform maintenance on organizational systems.', 'not_met', 'github'),
('MA.L2-3.7.2', 'MA', 'Maintenance', 'System Maintenance Control', 'Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.', 'not_met', 'github'),
('MA.L2-3.7.3', 'MA', 'Maintenance', 'Equipment Sanitization', 'Ensure equipment removed for off-site maintenance is sanitized of any CUI.', 'not_met', 'not_applicable'),
('MA.L2-3.7.4', 'MA', 'Maintenance', 'Media Inspection', 'Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.', 'not_met', 'github'),
('MA.L2-3.7.5', 'MA', 'Maintenance', 'Nonlocal Maintenance', 'Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.', 'not_met', 'supabase'),
('MA.L2-3.7.6', 'MA', 'Maintenance', 'Maintenance Personnel', 'Supervise the maintenance activities of maintenance personnel without required access authorization.', 'not_met', 'not_applicable')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- MP: Media Protection (9 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('MP.L2-3.8.1', 'MP', 'Media Protection', 'Media Protection', 'Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital.', 'not_met', 'not_applicable'),
('MP.L2-3.8.2', 'MP', 'Media Protection', 'Media Access', 'Limit access to CUI on system media to authorized users.', 'not_met', 'supabase'),
('MP.L2-3.8.3', 'MP', 'Media Protection', 'Media Disposal', 'Sanitize or destroy system media containing CUI before disposal or release for reuse.', 'not_met', 'supabase'),
('MP.L2-3.8.4', 'MP', 'Media Protection', 'Media Markings', 'Mark media with necessary CUI markings and distribution limitations.', 'not_met', 'not_applicable'),
('MP.L2-3.8.5', 'MP', 'Media Protection', 'Media Accountability', 'Control access to media containing CUI and maintain accountability for media during transport outside of controlled areas.', 'not_met', 'not_applicable'),
('MP.L2-3.8.6', 'MP', 'Media Protection', 'Portable Storage Encryption', 'Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport unless otherwise protected by alternative physical safeguards.', 'not_met', 'not_applicable'),
('MP.L2-3.8.7', 'MP', 'Media Protection', 'Removable Media', 'Control the use of removable media on system components.', 'not_met', 'not_applicable'),
('MP.L2-3.8.8', 'MP', 'Media Protection', 'Shared Media', 'Prohibit the use of portable storage devices when such devices have no identifiable owner.', 'not_met', 'not_applicable'),
('MP.L2-3.8.9', 'MP', 'Media Protection', 'Protect Backups', 'Protect the confidentiality of backup CUI at storage locations.', 'not_met', 'supabase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- PS: Personnel Security (2 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('PS.L2-3.9.1', 'PS', 'Personnel Security', 'Screen Individuals', 'Screen individuals prior to authorizing access to organizational systems containing CUI.', 'not_met', 'not_applicable'),
('PS.L2-3.9.2', 'PS', 'Personnel Security', 'Personnel Actions', 'Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.', 'not_met', 'supabase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- PE: Physical Protection (6 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('PE.L2-3.10.1', 'PE', 'Physical Protection', 'Limit Physical Access', 'Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.', 'not_met', 'not_applicable'),
('PE.L2-3.10.2', 'PE', 'Physical Protection', 'Protect & Monitor Facility', 'Protect and monitor the physical facility and support infrastructure for organizational systems.', 'not_met', 'not_applicable'),
('PE.L2-3.10.3', 'PE', 'Physical Protection', 'Escort Visitors', 'Escort visitors and monitor visitor activity.', 'not_met', 'not_applicable'),
('PE.L2-3.10.4', 'PE', 'Physical Protection', 'Physical Access Logs', 'Maintain audit logs of physical access.', 'not_met', 'not_applicable'),
('PE.L2-3.10.5', 'PE', 'Physical Protection', 'Manage Physical Access', 'Control and manage physical access devices.', 'not_met', 'not_applicable'),
('PE.L2-3.10.6', 'PE', 'Physical Protection', 'Alternative Work Sites', 'Enforce safeguarding measures for CUI at alternate work sites.', 'not_met', 'not_applicable')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- RA: Risk Assessment (3 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('RA.L2-3.11.1', 'RA', 'Risk Assessment', 'Risk Assessments', 'Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.', 'not_met', 'codebase'),
('RA.L2-3.11.2', 'RA', 'Risk Assessment', 'Vulnerability Scan', 'Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.', 'not_met', 'github'),
('RA.L2-3.11.3', 'RA', 'Risk Assessment', 'Vulnerability Remediation', 'Remediate vulnerabilities in accordance with risk assessments.', 'not_met', 'github')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- CA: Security Assessment (4 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('CA.L2-3.12.1', 'CA', 'Security Assessment', 'Security Control Assessment', 'Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.', 'not_met', 'codebase'),
('CA.L2-3.12.2', 'CA', 'Security Assessment', 'Plan of Action', 'Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.', 'not_met', 'codebase'),
('CA.L2-3.12.3', 'CA', 'Security Assessment', 'Security Control Monitoring', 'Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.', 'not_met', 'sentry'),
('CA.L2-3.12.4', 'CA', 'Security Assessment', 'System Security Plan', 'Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.', 'not_met', 'codebase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- SC: System & Communications Protection (16 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('SC.L2-3.13.1', 'SC', 'System & Communications Protection', 'Boundary Protection', 'Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of organizational systems.', 'not_met', 'netlify'),
('SC.L2-3.13.2', 'SC', 'System & Communications Protection', 'Security Engineering', 'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.', 'not_met', 'codebase'),
('SC.L2-3.13.3', 'SC', 'System & Communications Protection', 'Role-Based Security', 'Separate user functionality from system management functionality.', 'not_met', 'supabase'),
('SC.L2-3.13.4', 'SC', 'System & Communications Protection', 'Shared Resource Control', 'Prevent unauthorized and unintended information transfer via shared system resources.', 'not_met', 'supabase'),
('SC.L2-3.13.5', 'SC', 'System & Communications Protection', 'Public-Access System Separation', 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.', 'not_met', 'netlify'),
('SC.L2-3.13.6', 'SC', 'System & Communications Protection', 'Network Communication by Exception', 'Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).', 'not_met', 'netlify'),
('SC.L2-3.13.7', 'SC', 'System & Communications Protection', 'Split Tunneling', 'Prevent remote devices from simultaneously establishing non-remote connections with organizational systems and communicating via some other connection to resources in external networks (i.e., split tunneling).', 'not_met', 'not_applicable'),
('SC.L2-3.13.8', 'SC', 'System & Communications Protection', 'Data in Transit', 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.', 'not_met', 'netlify'),
('SC.L2-3.13.9', 'SC', 'System & Communications Protection', 'Network Disconnect', 'Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.', 'not_met', 'supabase'),
('SC.L2-3.13.10', 'SC', 'System & Communications Protection', 'Key Management', 'Establish and manage cryptographic keys for cryptography employed in organizational systems.', 'not_met', 'supabase'),
('SC.L2-3.13.11', 'SC', 'System & Communications Protection', 'CUI Encryption', 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.', 'not_met', 'supabase'),
('SC.L2-3.13.12', 'SC', 'System & Communications Protection', 'Collaborative Device Control', 'Prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device.', 'not_met', 'not_applicable'),
('SC.L2-3.13.13', 'SC', 'System & Communications Protection', 'Mobile Code', 'Control and monitor the use of mobile code.', 'not_met', 'netlify'),
('SC.L2-3.13.14', 'SC', 'System & Communications Protection', 'Voice over Internet Protocol', 'Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.', 'not_met', 'not_applicable'),
('SC.L2-3.13.15', 'SC', 'System & Communications Protection', 'Communications Authenticity', 'Protect the authenticity of communications sessions.', 'not_met', 'netlify'),
('SC.L2-3.13.16', 'SC', 'System & Communications Protection', 'Data at Rest', 'Protect the confidentiality of CUI at rest.', 'not_met', 'supabase')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- SI: System & Information Integrity (7 requirements)
-- =============================================================================

INSERT INTO ciso_cmmc_practices (practice_id, family, family_name, title, description, implementation_status, mmt_component)
VALUES
('SI.L2-3.14.1', 'SI', 'System & Information Integrity', 'Flaw Remediation', 'Identify, report, and correct information and information system flaws in a timely manner.', 'not_met', 'github'),
('SI.L2-3.14.2', 'SI', 'System & Information Integrity', 'Malicious Code Protection', 'Provide protection from malicious code at designated locations within organizational systems.', 'not_met', 'github'),
('SI.L2-3.14.3', 'SI', 'System & Information Integrity', 'Security Alerts & Advisories', 'Monitor system security alerts and advisories and take action in response.', 'not_met', 'sentry'),
('SI.L2-3.14.4', 'SI', 'System & Information Integrity', 'Update Malicious Code Protection', 'Update malicious code protection mechanisms when new releases are available.', 'not_met', 'github'),
('SI.L2-3.14.5', 'SI', 'System & Information Integrity', 'System & File Scanning', 'Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.', 'not_met', 'github'),
('SI.L2-3.14.6', 'SI', 'System & Information Integrity', 'Monitor Communications for Attacks', 'Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.', 'not_met', 'sentry'),
('SI.L2-3.14.7', 'SI', 'System & Information Integrity', 'Identify Unauthorized Use', 'Identify unauthorized use of organizational systems.', 'not_met', 'sentry')
ON CONFLICT (practice_id) DO NOTHING;

-- =============================================================================
-- Verification: count should be 110
-- =============================================================================
-- SELECT family, COUNT(*) FROM ciso_cmmc_practices GROUP BY family ORDER BY family;
-- SELECT COUNT(*) AS total FROM ciso_cmmc_practices;
