"use client";

import { useEffect, useRef, useState } from "react";
import type { Recipient, WorkOrder, Budget, TestIntentResponse } from "./types";
import { explainDecision } from "./types";
import type { WebMCPTool } from "@/types/webmcp";

type AgentCall = { at: string; tool: string; summary: string };

export function useAgentTools(deps: {
  token: string;
  recipients: Recipient[];
  workOrders: WorkOrder[];
  budget: Budget;
  lastDecision: TestIntentResponse | null;
  submitPayment: (recipientRef: string, artifact: string) => Promise<TestIntentResponse>;
}): { supported: boolean | null; registered: string[]; calls: AgentCall[] } {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [registered, setRegistered] = useState<string[]>([]);
  const [calls, setCalls] = useState<AgentCall[]>([]);
  
  // Use a ref to avoid stale closures
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    // Feature detection
    const isSupported = typeof document !== "undefined" && Boolean(document.modelContext);
    setSupported(isSupported);
    
    if (!isSupported) return;
    
    // Register tools
    const registerTools = async () => {
      const tools: WebMCPTool[] = [
        // Deliberately NOT exposed to agents: override a refusal, change a cap, kill switch.
        // Those are human-only controls. The boundary is the product.
        
        // Tool 1: list_work_orders
        {
          name: "list_work_orders",
          description: "List the open work orders an agent may pay against. A payment must match exactly one of these by ref and amount.",
          inputSchema: {
            type: "object",
            properties: {},
          },
          execute: async () => {
            const workOrders = depsRef.current.workOrders;
            const result = workOrders.map(wo => ({
              ref: wo.ref,
              recipient_ref: wo.recipientRef,
              recipient_name: wo.recipientName,
              ceiling_usdc: wo.ceiling,
              expires_at: wo.expiresAt,
              status: wo.status
            }));
            
            // Log the call
            setCalls(prev => [{ 
              at: new Date().toISOString(), 
              tool: "list_work_orders", 
              summary: `Listed ${workOrders.length} work orders` 
            }, ...prev].slice(0, 50));
            
            return JSON.stringify(result);
          }
        },
        
        // Tool 2: list_recipients
        {
          name: "list_recipients",
          description: "List recipients on the allowlist. Only these can be paid.",
          inputSchema: {
            type: "object",
            properties: {},
          },
          execute: async () => {
            const recipients = depsRef.current.recipients;
            const result = recipients.map(r => ({
              ref: r.ref,
              display_name: r.displayName,
              active: r.active
            }));
            
            // Log the call
            setCalls(prev => [{ 
              at: new Date().toISOString(), 
              tool: "list_recipients", 
              summary: `Listed ${recipients.length} recipients` 
            }, ...prev].slice(0, 50));
            
            return JSON.stringify(result);
          }
        },
        
        // Tool 3: get_budget
        {
          name: "get_budget",
          description: "Read the agent's spending caps and current usage. The agent cannot change these.",
          inputSchema: {
            type: "object",
            properties: {},
          },
          execute: async () => {
            const budget = depsRef.current.budget;
            const result = {
              agent: budget.agentName,
              spent_day_usdc: budget.spentDay,
              cap_day_usdc: budget.capDay,
              spent_hour_usdc: budget.spentHour,
              cap_hour_usdc: budget.capHour,
              kill_switch: budget.killSwitch
            };
            
            // Log the call
            setCalls(prev => [{ 
              at: new Date().toISOString(), 
              tool: "get_budget", 
              summary: `Retrieved budget for ${budget.agentName}` 
            }, ...prev].slice(0, 50));
            
            return JSON.stringify(result);
          }
        },
        
        // Tool 4: submit_payment
        {
          name: "submit_payment",
          description: "Attempt a payment. Two isolated verification channels must agree on the work order and amount; if they disagree the payment is refused and the agent cannot override that. Takes up to 60 seconds.",
          inputSchema: {
            type: "object",
            properties: {
              recipient_ref: { type: "string" },
              artifact: { type: "string", description: "the delivery note or invoice text, verbatim, as evidence the work happened" }
            },
            required: ["recipient_ref", "artifact"],
          },
          execute: async (input) => {
            const recipient_ref = String(input.recipient_ref ?? "");
            const artifact = String(input.artifact ?? "");
            const { token, submitPayment } = depsRef.current;
            
            // Check if token is set
            if (!token) {
              const result = { 
                error: "OPERATOR_TOKEN_NOT_SET",
                message: "A human must paste the operator token into the console before any payment can be attempted."
              };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "submit_payment", 
                summary: `Failed: Operator token not set` 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            }
            
            try {
              const response = await submitPayment(recipient_ref, artifact);
              
              // Map decision values
              const decision = response.decision === "RED" ? "REFUSED" : 
                              response.decision === "AMBER" ? "HELD" : 
                              response.decision;
              
              // Get explanation
              const explanation = explainDecision(response.decision, response.reasonCode || null);
              
              const result = {
                id: response.id ?? "unknown",
                decision,
                reason_code: response.reasonCode,
                digest: response.digest,
                explorer_url: response.explorerUrl,
                receipt_url: response.publicToken ? `/r/${response.publicToken}` : undefined,
                explanation
              };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "submit_payment", 
                summary: `Payment ${decision} to ${recipient_ref}` 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            } catch (error) {
              const result = { 
                error: error instanceof Error ? error.message : "Unknown error occurred"
              };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "submit_payment", 
                summary: `Error: ${result.error}` 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            }
          }
        },
        
        // Tool 5: get_last_decision
        {
          name: "get_last_decision",
          description: "Get the result of the most recent payment attempt.",
          inputSchema: {
            type: "object",
            properties: {},
          },
          execute: async () => {
            const lastDecision = depsRef.current.lastDecision;
            
            if (!lastDecision) {
              const result = { message: "No payment has been attempted yet." };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "get_last_decision", 
                summary: "No previous payment found" 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            }
            
            // Map decision values
            const decision = lastDecision.decision === "RED" ? "REFUSED" : 
                            lastDecision.decision === "AMBER" ? "HELD" : 
                            lastDecision.decision;
            
            // Get explanation
            const explanation = explainDecision(lastDecision.decision, lastDecision.reasonCode || null);
            
            const result = {
              id: lastDecision.id ?? "unknown",
              decision,
              reason_code: lastDecision.reasonCode,
              digest: lastDecision.digest,
              explorer_url: lastDecision.explorerUrl,
              receipt_url: lastDecision.publicToken ? `/r/${lastDecision.publicToken}` : undefined,
              explanation
            };
            
            // Log the call
            setCalls(prev => [{ 
              at: new Date().toISOString(), 
              tool: "get_last_decision", 
              summary: `Retrieved last payment: ${decision}` 
            }, ...prev].slice(0, 50));
            
            return JSON.stringify(result);
          }
        },
        
        // Tool 6: list_ledger
        {
          name: "list_ledger",
          description: "Get the payment ledger history.",
          inputSchema: {
            type: "object",
            properties: {},
          },
          execute: async () => {
            const token = depsRef.current.token;
            
            // Check if token is set
            if (!token) {
              const result = { 
                error: "OPERATOR_TOKEN_NOT_SET",
                message: "A human must paste the operator token into the console before any payment can be attempted."
              };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "list_ledger", 
                summary: `Failed: Operator token not set` 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            }
            
            try {
              const response = await fetch("/api/console/ledger", {
                headers: {
                  authorization: `Bearer ${token}`
                }
              });
              
              if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
              }
              
              const result = await response.text();
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "list_ledger", 
                summary: "Retrieved ledger" 
              }, ...prev].slice(0, 50));
              
              return result;
            } catch (error) {
              const result = { 
                error: error instanceof Error ? error.message : "Unknown error occurred"
              };
              
              // Log the call
              setCalls(prev => [{ 
                at: new Date().toISOString(), 
                tool: "list_ledger", 
                summary: `Error: ${result.error}` 
              }, ...prev].slice(0, 50));
              
              return JSON.stringify(result);
            }
          }
        }
      ];
      
      // Register each tool
      const toolNames: string[] = [];
      for (const tool of tools) {
        await document.modelContext?.registerTool(tool);
        toolNames.push(tool.name);
      }
      
      setRegistered(toolNames);
      
      // Cleanup function
      return () => {
        for (const tool of tools) {
          document.modelContext?.unregisterTool?.(tool.name);
        }
      };
    };
    
    registerTools();
  }, []); // Empty dependency array - tools are registered once

  return { supported, registered, calls };
}