import fetch from 'node-fetch';

async function testSelectiveFeedback() {
    console.log("--- Testing Selective Feedback ---");

    const cases = [
        { name: "Good Speech", transcript: "Hello everyone, today I am going to talk about the importance of artificial intelligence in modern healthcare. It is a very exciting field with a lot of potential." },
        { name: "Speech with fillers", transcript: "Um, so, like, today... uh... I want to talk about, you know, stuff. It's like, really important, um, for the future." }
    ];

    for (const test of cases) {
        console.log(`\nTesting Case: ${test.name}`);
        console.log(`Transcript: "${test.transcript}"`);

        try {
            const response = await fetch('http://localhost:3000/api/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: test.transcript })
            });

            const data = await response.json();
            
            if (data.feedback === null) {
                console.log("Result: ✓ No feedback sent (as expected).");
            } else {
                console.log(`Result: Feedback received: "${data.feedback}"`);
                console.log(`Audio length: ${data.audio ? data.audio.length : 0}`);
            }
        } catch (error) {
            console.error("Test failed:", error.message);
        }
    }
}

testSelectiveFeedback();
