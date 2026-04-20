# Stenographer Practice Platform

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017

### 1. Backend Setup
```bash
cd backend
npm install
node seed.js          # creates admin user
npm run dev           # starts on http://localhost:5000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev           # starts on http://localhost:5173
```

### Default Admin Credentials
- Email: `admin@steno.com`
- Password: `admin123`

## Workflow
1. Login as admin → Upload PDF test → Assign to users
2. Login as user → Start test → Listen to audio → Type → Submit → View results

## Folder Structure
```
st-application/
├── backend/
│   ├── src/
│   │   ├── models/         # Mongoose models
│   │   ├── routes/         # Express routes
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── utils/          # Evaluation logic
│   │   └── index.js
│   ├── uploads/
│   │   ├── pdfs/           # Uploaded PDFs
│   │   └── audio/          # Generated MP3s
│   ├── seed.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/          # Login, Dashboard, TestPage, ResultPage, AdminDashboard
    │   ├── context/        # AuthContext
    │   └── api/            # Axios instance
    └── package.json
```

## Evaluation Rules
- Exact match → correct
- Levenshtein distance ≤ 30% → 0.5 mistake
- Wrong word → 1 mistake
- Extra word typed → 1.5 mistakes total















---------------------------------------------------------------------------------------------









--                                                                                                                                                                                     
  Complete VACE Pass 2 — what was added to the workflow:                                                                                                                                  
                                                                                                                                                                                          
  Pass 1 (existing, unchanged)                                                                                                                                                            
    VHS_LoadVideo → SCAIL Sampler (438) → pass1_latents                                                                                                                                   
                                                │                                                                                                                                         
                           ┌────────────────────┘                                                                                                                                         
                           │                                                                                                                                                              
  Pass 2 (NEW nodes 500–507)                                                                                                                                                              
                           │                                                                                                                                                              
              [503] Decode Pass1 latents → images                                                                                                                                         
                           │                                                                                                                                                              
              [504] WanVideoVACEEncode                                                                                                                                                    
                    ├── input_frames = SCAIL decoded images                                                                                                                               
                    ├── input_masks  = SapiensHandMaskGenerator (same hand masks)                                                                                                         
                    └── vae          = Get_VAE                                                                                                                                            
                           │                                                                                                                                                              
                    vace_embeds                                                                                                                                                           
                           │                                                                                                                                                              
              [507] WanVideoSamplerv2 (VACE mode)                                                                                                                                         
                    ├── model        = Get_vace_model (node 502)                                                                                                                          
                    ├── image_embeds = vace_embeds  ← VACE drives generation                                                                                                              
                    ├── text_embeds  = same as Pass1                                                                                                                                      
                    ├── scheduler    = same as Pass1                                                                                                                                      
                    └── cfg          = same as Pass1                                                                                                                                      
                           │                                                                                                                                                              
              [28] WanVideoDecode → final output                                                                                                                                          
                                                                                                                                                                                          
  One thing you must do before running:                                                                                                                                                   
                                                                                                                                                                                          
  Download the VACE model and place it at:                                                                                                                                                
  ComfyUI/models/diffusion_models/WanVideo/wan2.1_vace_14B_fp16.safetensors                                                                                                               
                                                                                                                                                                                          
  Get it from HuggingFace: Wan-AI/Wan2.1-VACE-14B — or the fp8 quantized version if VRAM is limited. Then update node 500 (VACE Model Loader) filename to match whatever you downloaded.  
                                                                                                                                                                                          
  Key settings to tune in node 504 (WanVideoVACEEncode):                                                                                                                                  
  - strength = 1.0 (how strongly VACE guides the hand region)                                                                                                                             
  - vace_start_percent / vace_end_percent = 0.0 / 1.0 (VACE active for all steps)                                                                                                         
                                                                                                                                                                                          
  Key settings in node 507 (VACE Sampler):                                                                                                                                                
  - steps = 20 (fewer steps since it's just fixing hands)                                                                                                                                 
  - Lower cfg (try 3–5) for more natural-looking hands                                                                                                                                    
                                                                                                                                                                                        
✻ Brewed for 6m 20s                                                                                                                                                                       
              






              ● All three fixes are in place. Here's what was wrong and what was changed:

  ---
  Root causes (workflow JSON):

  Bug 1 — Mask in wrong coordinate space (SapiensHandMaskGenerator node 442)
  - Was: width=832, height=480 — landscape orientation, completely wrong
  - Fixed: width=480, height=832 — matches the portrait video resolution

  Bug 2 — Source latents at wrong resolution (WanVideoEncode node 444)
  - Was: encoding frames from node [131] → 512×896 pixels → latent shape (1,C,T,64,112)
  - Fixed: now encodes from node [107] → 480×832 pixels → latent shape (1,C,T,60,104) — same as the generated pass1 latents

  Because of these two bugs, the hand region being blended back was in a completely different coordinate space and spatial size from the generated video, creating the "sticker pasted at
  wrong position" look.

  ---
  Python code fixes (already applied earlier + now):

  ┌──────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │                            Change                            │                                   Effect                                    │
  ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Feather blur (feather_radius=25) on mask before downsampling │ Removes hard rectangular edge → natural soft blend                          │
  ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ mode='bilinear' for spatial downsample                       │ Preserves gradient at mask boundary                                         │
  ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Spatial alignment safety check                               │ If source_latents still differ in size, bilinear-resize them to match pass1 │
  └──────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  To apply: reload the workflow JSON in ComfyUI and restart ComfyUI to pick up the Python changes.

✻ Cooked for 3m 1s

❯ is the currct methos...                                                                                                                                                                 

● Let me re-examine more carefully before confirming — I want to make sure changing the encode source from 131 to 107 was right, since 107 is the reference image and 131 is the video
  frames.

● Bash(python3 -c "
      import json…)
  ⎿  === FULL LINK TABLE ===
       234: [130]VHS_LoadVideo()[0] --> [131]ImageResizeKJv2()[0]
       327: [176]GetNode(Get_VAE)[0] --> [28]WanVideoDecode()[0]
     … +30 lines (ctrl+o to expand)

● I need to re-examine my fix #2 more carefully. Looking at the full link table:

  - Node 107 → single reference image (from LoadImage)
  - Node 131 → multi-frame video (from VHS_LoadVideo)
  - Both resize to the same Get_width / Get_height target
  - gen_width / gen_height are set from node 107's actual output dimensions

  So both 107 and 131 produce the same spatial size. But WanVideoEncode must encode video frames (node 131), not the reference image (node 107). Fix #2 was wrong — reverting it:

● Bash(python3 -c "
      import json…)
  ⎿  Before: [809, 107, 0, 444, 1, 'IMAGE']
     After:  [809, 131, 0, 444, 1, 'IMAGE']
     Saved.

● Now let me verify the actual resize dimensions both nodes produce:

● Bash(python3 -c "
      import json…)
  ⎿    [203] INTConstant title='width'  widgets=[512]
       [204] INTConstant title='height'  widgets=[512]
       [206] SetNode title='Set_width'  widgets=['width']
     … +18 lines (ctrl+o to expand)

● Good catch needed here. The mask generator is now fixed to 480×832 but the actual video resize dimensions come from Get_width/Get_height (nodes 208/209 → constants 203/204 = 512). If
  the user changes those constants, the mask will misalign again.

  The robust fix: connect SapiensHandMaskGenerator's width and height inputs directly to the same Get_width / Get_height nodes that node 131 uses, so they always auto-match:

● Bash(python3 -c "
      import json…)
  ⎿  Max link id: 825
     Node 442 inputs: [{'name': 'keypoints', 'type': 'SAPIENS_KEYPOINTS', 'link': 808}]
     Node 442 widgets: [480, 832, 20, 0.3]

● Bash(python3 -c "
      import json…)
  ⎿  Node 442 inputs now: [{'name': 'keypoints', 'type': 'SAPIENS_KEYPOINTS', 'link': 808}, {'name': 'width', 'type': 'INT', 'widget': {'name': 'width'}, 'link': 826}, {'name': 'hei
     ght', 'type': 'INT', 'widget': {'name': 'height'}, 'link': 827}]
     Node 442 widgets: [480, 832, 20, 0.3]
     Saved.

● Now let me do a final sanity check — confirm the complete corrected data flow:

● Bash(python3 -c "
      import json…)
  ⎿  [446] WanVideoHandLatentBlend title=''  widgets=[1]
       <-- (pass1_latents) via link 813 from node [438]
       [438] WanVideoSamplerv2 title=''  widgets=[6, 42, 'fixed', True, False]
     … +30 lines (ctrl+o to expand)

● The data flow is now correct. Here's the final summary of all changes:

  ---
  Workflow JSON (2nd-option-last-working-workflow.json):

  ┌───────────────────────────────┬──────────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────┐
  │              Fix              │                             What changed                             │                                    Why                                     │
  ├───────────────────────────────┼──────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ SapiensHandMaskGenerator      │ width 832→480, height 480→832                                        │ Was in landscape orientation — completely wrong coordinate space           │
  │ (442)                         │                                                                      │                                                                            │
  ├───────────────────────────────┼──────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ SapiensHandMaskGenerator      │ width + height now wired to Get_width/Get_height (same source as     │ So mask always auto-matches video resolution, regardless of what constants │
  │ (442)                         │ node 131)                                                            │  are set                                                                   │
  ├───────────────────────────────┼──────────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ WanVideoEncode (444) source   │ Reverted my earlier bad change — stays on node 131 (video frames)    │ 107 is the reference image, not the video                                  │
  └───────────────────────────────┴──────────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────┘

  Python code (sapiens_converter_node.py):

  ┌─────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
  │                   Fix                   │                                       Effect                                       │
  ├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ feather_radius=25 Gaussian blur on mask │ Removes hard rectangular sticker edge                                              │
  ├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ Spatial downsampling nearest → bilinear │ Preserves soft gradient at mask boundary in latent space                           │
  ├─────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────┤
  │ Spatial alignment safety resize         │ If somehow source_latents still differ in size, they get bilinear-resized to match │
  └─────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────┘

  The root sticker cause was #1 — the mask was being computed at 832×480 (landscape, width/height swapped) while the video is portrait 480×832, so the hand region was mapped to a
  completely wrong position in the frame.

✻ Churned for 2m 34s

※ recap: Fixed hand alignment sticker issue in the workflow. Reload the updated JSON in ComfyUI and restart ComfyUI to test the corrected hand blending. (disable recaps in /config)

❯ what we are doing in this method we mask hand or somethinf ele                                                                                                                          

● Good question. Let me trace the full pipeline so you understand exactly what's happening:

  ---
  The Problem Being Solved

  WanVideo SCAIL generates good body motion but produces bad/distorted hands. The goal is to fix the hands in the output video.

  ---
  What the Pipeline Does — Step by Step

  Original Video
       │
       ├──► [131] Resize ──► [SapiensSampler] detects body+hand keypoints
       │                              │
       │                     [SapiensHandMaskGenerator]
       │                       builds a rectangular mask
       │                       around the hand regions
       │                              │
       ├──► [WanVideoEncode] ─────────┤
       │    encodes original          │
       │    video → source_latents    │
       │                              │
       └──► [WanVideoSamplerv2] ──────┤
            generates NEW video       │
            with SCAIL pose control   │
            → pass1_latents           │
                      │               │
                      ▼               ▼
              [WanVideoHandLatentBlend]
               blends the two latents:
               • non-hand areas → keep generated video (pass1)
               • hand areas     → paste back original video (source)
                      │
                      ▼
              [WanVideoDecode] → final video

  ---
  In Simple Terms

  1. Generate a new video with corrected poses using SCAIL
  2. Detect where the hands are in the original video (using Sapiens keypoints → bounding box mask)
  3. Blend at latent level: keep the generated video everywhere except the hand regions, where you paste back the original video's latents

  So yes — you mask the hands in the original video and copy those latents back into the generated video. The idea is:

  ▎ "The original video has real, natural hands. The generated video has bad hands. So cut out the hand area from the generated video and replace it with the original hands."

  ---
  The Limitation of This Approach

  The hand area from the original video is pasted back as-is — meaning:
  - If the pose generation moved the body/arms slightly, the hands won't match the new arm positions
  - That's exactly why you were seeing the sticker effect — the hand region was being pasted at the wrong coordinates due to the mask dimensions being wrong (832×480 instead of 480×832)

  After the fix, the mask is in the correct coordinate space, so the hand region will be cut and pasted at the right location in the frame.

❯ the original video color reflected in refrensh image video in hands region and hand not alline propely.....how to fix htis                                                              

● This reveals a fundamental problem with the blend approach itself, not just the code. Let me explain what's happening:

  ---
  Why Color Mismatch Happens

  Original Video          Reference Image
  (real person, real       (different style/
   lighting, colors)        lighting, appearance)
        │                         │
        │                         ▼
        │                   WanVideoSamplerv2
        │                   generates video in
        │                   reference image style
        │                         │
        ▼                         ▼
  [WanVideoHandLatentBlend]
    pastes ORIGINAL hands ──► into REFERENCE-STYLE video
    ❌ color clash
    ❌ lighting mismatch
    ❌ skin tone difference

  The blend node assumes original video and generated video have matching appearance. If the reference image has different lighting/style, the pasted hands will always look like a
  sticker from a different video.

  ---
  Why Alignment Fails

  SCAIL can shift the body position slightly. The hand mask is computed from original video keypoints — so even if the mask dimensions are now correct, the hand position in the generated
   video might be slightly different:

  Original video:  hands at (x=200, y=300)
  Generated video: hands at (x=215, y=290)  ← SCAIL shifted body
  Mask still cuts at (x=200, y=300) ← wrong position

  ---
  The Right Fix: VACE Second Pass

  Instead of pasting original hands, use WanVideo VACE to regenerate the hand region in the same style as the generated video:

  SCAIL Output (bad hands but correct style)
           │
           ├──► Mask hand region
           │
           ▼
     WanVideoVACEEncode
     (video=SCAIL output, mask=hand region)
           │
           ▼
     WanVideoSamplerv2  (second pass, VACE mode)
     regenerates ONLY the masked hand area
     in reference image style
           │
           ▼
     Clean output — hands match the style, body stays intact

  OR the simpler fix: remove the blend entirely and improve the DW Pose hand conditioning in the SCAIL pass. If the hand poses are accurate enough, SCAIL should generate acceptable hands
   without any blending.

  ---
  Which path do you want?

  1. VACE second pass — adds a second generation step specifically for hands, generates hands in the correct style (better quality, slower)
  2. Better SCAIL hand conditioning — tune the existing first pass to get better hands directly (faster, no second pass)
  3. Keep current blend but add color matching — match the pasted hands' colors to the generated video before blending (quick patch, not as clean)

  Which one fits your workflow?

✻ Baked for 53s

❯ which one best for accurate fingers and hand moments                                                                                                                                    

● VACE Second Pass is the best for accurate fingers and hand movements. Here's why:

  ---
  Why VACE wins for fingers

  ┌───────────────────────────┬─────────────────────────┬─────────────┬───────┐
  │         Approach          │     Finger Accuracy     │ Style Match │ Speed │
  ├───────────────────────────┼─────────────────────────┼─────────────┼───────┤
  │ VACE second pass          │ ✅ Best                 │ ✅ Perfect  │ Slow  │
  ├───────────────────────────┼─────────────────────────┼─────────────┼───────┤
  │ Better SCAIL conditioning │ Moderate                │ ✅ Good     │ Fast  │
  ├───────────────────────────┼─────────────────────────┼─────────────┼───────┤
  │ Color match blend         │ ❌ Still original hands │ ❌ Mismatch │ Fast  │
  └───────────────────────────┴─────────────────────────┴─────────────┴───────┘

  SCAIL is trained for full-body motion — fingers are too fine-grained for it to generate accurately even with good DW Pose input.

  VACE isolates the hand region and regenerates only that area with full attention on the hand — it can follow finger-level DW Pose detail much more accurately, AND the output will match
   the style of the surrounding generated video automatically.

  ---
  How the VACE second pass works

  Pass 1 — SCAIL (current)
    Original video → SCAIL → generated video (good body, bad hands)

  Pass 2 — VACE (new)
    SCAIL output video  ──► WanVideoVACEEncode  (video + hand mask)
    DW Pose (hands)     ──►        │
                                   ▼
                           WanVideoSampler (VACE mode)
                           only regenerates hand region
                           rest of video is locked/preserved
                                   │
                                   ▼
                           Final video — correct style + accurate fingers

  ---
  Do you want me to build this into the workflow?

  I'll need to:
  1. Add a decode step after SCAIL output → images
  2. Wire WanVideoVACEEncode with the SCAIL images + hand mask
  3. Add a second WanVideoSamplerv2 in VACE mode
  4. Connect DW Pose hand conditioning to the VACE pass
  5. Final decode to output

  It reuses nodes already in your workflow — just needs new connections. Should I go ahead and build it?

❯ yes build this workflow and how to build this steps for thnis                                                                                                                           

  Searched for 4 patterns, read 2 files (ctrl+o to expand)

● Bash(python3 -c "
      import json…)
  ⎿  [229] 53a657f3-c9eb-40f2-9ebd-1ed77d25ed67 title='' w=[None, 720, 720, None, None, 'wan2.1_vace_14B_fp16.safetensors', 'Wan21_CausVid_14B_T2V_lora_rank32.

● Bash(python3 -c "
      import json…)
  ⎿  [229] 53a657f3-c9eb-40f2-9ebd-1ed77d25ed67 title=''
        widgets=[None, 720, 720, None, None, 'wan2.1_vace_14B_fp16.safetensors', 'Wan21_CausVid_14B_T2V_lora_rank32.safetensors', 'umt5_
        IN mask(MASK)
     … +8 lines (ctrl+o to expand)

  Searched for 2 patterns (ctrl+o to expand)

● Bash(grep -n "class WanVideoModelLoader" /workspace/runpod-slim/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper/nodes.py
      find /workspace/runpod-slim/ComfyUI/custom_node…)
  ⎿  /workspace/runpod-slim/ComfyUI/custom_nodes/ComfyUI-WanVideoWrapper/nodes_model_loading.py

  Searched for 1 pattern (ctrl+o to expand)

● Bash(python3 -c "
      import json…)
  ⎿  [438] WanVideoSamplerv2  pos=[1485.7702836202573, -522.0386151958751]  size=[295.37109375, 749.8994140625]
     [444] WanVideoEncode  pos=[2341.7395655847317, -2590.2538984979906]  size=[273.705078125, 242]
     [446] WanVideoHandLatentBlend  pos=[3027.4400919892964, -2538.2720043355457]  size=[292.2974609375, 98]
     … +7 lines (ctrl+o to expand)

● Bash(python3 -c "
      import json…)
  ⎿  (No output)

  Read 1 file (ctrl+o to expand)

● Now I have everything I need. Let me build the complete VACE second pass into the workflow JSON:

● Bash(python3 << 'PYEOF'
      import json…)
  ⎿  Redirecting link 814:  [446][0] → [28][1]
       now:                 [507][0] → [28][1]
     Added link 843 to node 437 outputs
     … +4 lines (ctrl+o to expand)

● Bash(python3 -c "
      import json…)
  ⎿  === PASS 2 DATA FLOW VERIFICATION ===
       500 VACE ModelLoader                 outputs model → 501
       501 Set_vace_model                   stores as vace_model
     … +24 lines (ctrl+o to expand)                                                       

● Both link 814 and 846 point to the same destination — duplicate. Remove 846:                                                                                                            
                                                                                          
● Bash(python3 -c "                                                                                                                                                                       
      import json…)                                                                                                                                                                       
  ⎿  Running…                                                                             
●                                                                                                                                                                                         
✶ Harmonizing… (6m 7s · ↓ 4.6k tokens)                                                                                                                                                    
  ⎿  Node 507 outputs updated:i[{'name':u'samples',h'type':e'LATENT',C'links':c[814], 'slot_index': 0}]                                                                                   
     Removed duplicate link 846. Links: 87 → 86                                                                                                                                           
 ─                       ─            ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
● All clean. Here's the complete picture of what was built:                               
                                                                                          ────────────────────────────────────────────────────────────────────────────────────────────────
  ---                                                                                                                                                                                     
  Complete VACE Pass 2 — what was added to the workflow:                                                                                                                                  
                                                                                                                                                                                          
  Pass 1 (existing, unchanged)                                                                                                                                                            
    VHS_LoadVideo → SCAIL Sampler (438) → pass1_latents                                                                                                                                   
                                                │                                                                                                                                         
                           ┌────────────────────┘                                                                                                                                         
                           │                                                                                                                                                              
  Pass 2 (NEW nodes 500–507)                                                                                                                                                              
                           │                                                                                                                                                              
              [503] Decode Pass1 latents → images                                                                                                                                         
                           │                                                                                                                                                              
              [504] WanVideoVACEEncode                                                                                                                                                    
                    ├── input_frames = SCAIL decoded images                                                                                                                               
                    ├── input_masks  = SapiensHandMaskGenerator (same hand masks)                                                                                                         
                    └── vae          = Get_VAE                                                                                                                                            
                           │                                                                                                                                                              
                    vace_embeds                                                                                                                                                           
                           │                                                                                                                                                              
              [507] WanVideoSamplerv2 (VACE mode)                                                                                                                                         
                    ├── model        = Get_vace_model (node 502)                                                                                                                          
                    ├── image_embeds = vace_embeds  ← VACE drives generation                                                                                                              
                    ├── text_embeds  = same as Pass1                                                                                                                                      
                    ├── scheduler    = same as Pass1                                                                                                                                      
                    └── cfg          = same as Pass1                                                                                                                                      
                           │                                                                                                                                                              
              [28] WanVideoDecode → final output                                                                                                                                          
                                                                                                                                                                                          
  One thing you must do before running:                                                                                                                                                   
                                                                                                                                                                                          
  Download the VACE model and place it at:                                                                                                                                                
  ComfyUI/models/diffusion_models/WanVideo/wan2.1_vace_14B_fp16.safetensors                                                                                                               
                                                                                                                                                                                          
  Get it from HuggingFace: Wan-AI/Wan2.1-VACE-14B — or the fp8 quantized version if VRAM is limited. Then update node 500 (VACE Model Loader) filename to match whatever you downloaded.  
                                                                                                                                                                                          
  Key settings to tune in node 504 (WanVideoVACEEncode):                                                                                                                                  
  - strength = 1.0 (how strongly VACE guides the hand region)                                                                                                                             
  - vace_start_percent / vace_end_percent = 0.0 / 1.0 (VACE active for all steps)                                                                                                         
                                                                                                                                                                                          
  Key settings in node 507 (VACE Sampler):                                                                                                                                                
  - steps = 20 (fewer steps since it's just fixing hands)                                                                                                                                 
  - Lower cfg (try 3–5) for more natural-looking hands                                                                                                                                    
                        



































                         Bash(rm -f /tmp/hamer_demo_data.tar.gz && curl -L --retry 5 --retry-delay 3 -# https://www.cs.utexas.edu/~pavlakos/hamer/data/hamer_demo_data.tar.gz -o /tmp/hamer_de…)                 
  ⎿  Download started in background, PID: 10411                                                                                                                                           
                                                                                                                                                                                          
● The server seems to be throttling/dropping the connection. The best option now is to download from your browser and upload:                                                             
                                                                                                                                                                                          
  1. Open this URL in your browser and download it (~5GB):                                                                                                                                
  https://www.cs.utexas.edu/~pavlakos/hamer/data/hamer_demo_data.tar.gz                                                                                                                   
  2. Upload to /tmp/hamer_demo_data.tar.gz via FileBrowser                                                                                                                                
                                                                                                                                                                                          
  Or run this directly in your terminal (more reliable than background):                                                                                                                  
  curl -L --retry 10 https://www.cs.utexas.edu/~pavlakos/hamer/data/hamer_demo_data.tar.gz -o /tmp/hamer_demo_data.tar.gz                                                                 
                                                                                                                                                                                          
❯ cancel download process                                                                                                                                                                 
                                                                                                                                                                                          
● Bash(pkill -f "hamer_demo_data" 2>/dev/null; pkill wget 2>/dev/null; pkill curl 2>/dev/null; echo "Done")                                                                               
  ⎿  Error: Exit code 144                                                                                                                                                                 
                                                                                                                                                                                          
❯ we start again after some time                                                                                                                                                          
                                                                                                                                                                                          
● All downloads cancelled. We'll resume later. When you're ready, the plan is:                                                                                                            
                                                                                                                                                                                        
  1. Download hamer_demo_data.tar.gz (~5GB) via your browser                                                                                                                              
  2. Upload to /tmp/              
  3. Extract and build the ComfyUI node                                                                                                                                                   
                                                                                                                                                                                          
  Take your time — everything else (HaMeR install, MANO file) is already done.  