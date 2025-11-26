import React, { useState } from 'react';

const ReadingInterface = () => {
  const [selectedParagraph, setSelectedParagraph] = useState(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  // Sample document being read
  const documentParagraphs = [
    {
      id: 1,
      text: "Algorithmic systems are increasingly deployed to make consequential decisions about individuals, from hiring to lending to criminal sentencing. Proponents argue these systems reduce human bias by applying consistent criteria.",
      agentInterest: ['noble', 'eubanks']
    },
    {
      id: 2,
      text: "The promise of algorithmic objectivity rests on a fundamental misunderstanding of how these systems work. Training data reflects historical patterns of discrimination. The algorithm learns to replicate and scale those patterns.",
      agentInterest: ['noble', 'benjamin', 'eubanks']
    },
    {
      id: 3,
      text: "We conducted interviews with 45 case workers who use the predictive risk model in their daily practice. Many expressed ambivalence about the scores, using them as one input among many rather than as determinative.",
      agentInterest: ['eubanks']
    },
    {
      id: 4,
      text: "The political economy of algorithmic systems deserves more attention. Who funds their development? Who profits from their deployment? These questions are largely absent from the fairness literature.",
      agentInterest: ['noble', 'benjamin']
    }
  ];

  // The agents (sources the user has loaded)
  const agents = [
    { id: 'noble', name: 'Noble', work: 'Algorithms of Oppression', color: '#8b5cf6' },
    { id: 'benjamin', name: 'Benjamin', work: 'Race After Technology', color: '#ec4899' },
    { id: 'eubanks', name: 'Eubanks', work: 'Automating Inequality', color: '#f59e0b' }
  ];

  const getAgentById = (id) => agents.find(a => a.id === id);

  // Sample responses agents might give
  const agentResponses = {
    1: {
      noble: "This framing of 'reducing bias' is exactly what I warn against. It assumes the problem is individual prejudice rather than structural racism encoded into these systems from the start.",
      eubanks: "I've seen this rhetoric deployed to justify systems that intensify surveillance of poor communities. The 'consistency' being promised is consistent discrimination."
    },
    2: {
      noble: "Yes - and I'd push further. It's not just that training data is biased. The categories themselves, the decision to build the system, the choice of what to optimize - all of this is political.",
      benjamin: "The language of 'replication' is too passive. These systems actively produce race, updating old forms of discrimination for a new era while providing plausible deniability.",
      eubanks: "The Allegheny system I studied was trained on data from a child welfare system that had been targeting poor Black families for decades. The algorithm just automated the targeting."
    },
    3: {
      eubanks: "This matches what I found. But the ambivalence doesn't protect families - the scores still get recorded, still follow people, still shape institutional responses even when workers try to resist."
    },
    4: {
      noble: "Google's advertising model is inseparable from the racist results their search engine produces. You can't fix the outputs without confronting who profits from them.",
      benjamin: "The fairness literature wants technical fixes that leave the business model intact. That's not an accident - it's funded by the companies that need the fixes to be narrow."
    }
  };

  const handleParagraphClick = (para) => {
    setSelectedParagraph(para.id);
    if (para.agentInterest.length > 0) {
      // Agents respond to this paragraph
      const newMessages = para.agentInterest.map(agentId => ({
        agent: getAgentById(agentId),
        text: agentResponses[para.id]?.[agentId] || "..."
      }));
      setMessages(newMessages);
      setConversationOpen(true);
    }
  };

  const handleAskAll = () => {
    setMessages([
      { agent: getAgentById('noble'), text: "The methodology obscures more than it reveals. 45 interviews tells us about worker perception, not about the families being scored." },
      { agent: getAgentById('benjamin'), text: "I'm interested in what questions weren't asked. Did anyone interview the people subjected to these predictions?" },
      { agent: getAgentById('eubanks'), text: "I'd want to know more about how the 'ambivalence' translates into action. Do workers override scores? How often? For whom?" }
    ]);
    setConversationOpen(true);
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      fontFamily: 'Georgia, serif',
      background: '#fafaf9'
    }}>
      {/* Main reading area */}
      <div style={{ 
        flex: conversationOpen ? '0 0 55%' : '0 0 75%',
        padding: '60px',
        overflowY: 'auto',
        transition: 'flex 0.3s ease'
      }}>
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 'normal',
            marginBottom: '8px',
            color: '#1a1a1a'
          }}>
            Algorithmic Accountability in Practice
          </h1>
          <p style={{ 
            color: '#666', 
            fontSize: '14px',
            marginBottom: '40px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            Martinez et al., 2024
          </p>
          
          {documentParagraphs.map((para) => (
            <div 
              key={para.id}
              onClick={() => handleParagraphClick(para)}
              style={{
                position: 'relative',
                padding: '12px 16px',
                marginBottom: '16px',
                marginLeft: '-16px',
                cursor: para.agentInterest.length > 0 ? 'pointer' : 'default',
                background: selectedParagraph === para.id ? '#f5f5f4' : 'transparent',
                borderRadius: '4px',
                transition: 'background 0.15s ease'
              }}
            >
              {/* Agent interest indicators */}
              <div style={{
                position: 'absolute',
                left: '-24px',
                top: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                {para.agentInterest.map(agentId => (
                  <div
                    key={agentId}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: getAgentById(agentId).color,
                      opacity: 0.7
                    }}
                  />
                ))}
              </div>
              
              <p style={{ 
                fontSize: '18px', 
                lineHeight: '1.7',
                color: '#2a2a2a',
                margin: 0
              }}>
                {para.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Agent panel - always visible */}
      <div style={{
        flex: conversationOpen ? '0 0 45%' : '0 0 25%',
        borderLeft: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        transition: 'flex 0.3s ease'
      }}>
        {/* Agent roster */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e5e5e5'
        }}>
          <div style={{ 
            fontSize: '11px', 
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#888',
            marginBottom: '12px',
            fontFamily: 'system-ui, sans-serif'
          }}>
            In this conversation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {agents.map(agent => (
              <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: agent.color
                }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, fontFamily: 'system-ui, sans-serif' }}>
                    {agent.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                    {agent.work}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation area */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto',
          padding: '20px'
        }}>
          {!conversationOpen ? (
            <div style={{ 
              color: '#888', 
              fontSize: '14px',
              fontFamily: 'system-ui, sans-serif',
              textAlign: 'center',
              marginTop: '40px'
            }}>
              Click a paragraph to hear from your sources
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, i) => (
                <div key={i}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    marginBottom: '6px'
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: msg.agent.color
                    }} />
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 600,
                      fontFamily: 'system-ui, sans-serif',
                      color: '#333'
                    }}>
                      {msg.agent.name}
                    </span>
                  </div>
                  <p style={{ 
                    margin: 0,
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#444',
                    paddingLeft: '16px'
                  }}>
                    {msg.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e5e5e5'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Ask your sources..."
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'system-ui, sans-serif',
                outline: 'none'
              }}
            />
            <button
              onClick={handleAskAll}
              style={{
                padding: '10px 16px',
                background: '#1a1a1a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, sans-serif',
                cursor: 'pointer'
              }}
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingInterface;
