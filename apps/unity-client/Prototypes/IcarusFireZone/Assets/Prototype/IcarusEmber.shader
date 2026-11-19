Shader "Aetheria/Prototype/IcarusEmber"
{
    Properties
    {
        _Tint ("Tint", Color) = (1,1,1,1)
        _Shape ("Shape", Float) = 0
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent" }
        Pass
        {
            Tags { "LightMode"="SRPDefaultUnlit" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Tint;
                float _Shape;
            CBUFFER_END

            struct Attributes
            {
                float3 positionOS : POSITION;
                float4 uv : TEXCOORD0;
                half4 color : COLOR;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                half4 color : COLOR;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS);
                output.uv = input.uv.xy;
                output.color = input.color;
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 p = input.uv * 2 - 1;
                float radius = length(p);
                half4 color = _Tint * input.color;
                if (_Shape < 0.5) // Billboard embers
                {
                    color.rgb = lerp(color.rgb, half3(1, .93, .73), 1 - smoothstep(.03, .6, radius));
                    color.a *= 1 - smoothstep(.18, 1, radius);
                }
                else if (_Shape < 1.5) // Ground ring
                {
                    float angle = atan2(p.y, p.x);
                    float spokes = .58 + .42 * cos(angle * 12);
                    color.a *= max(1 - smoothstep(.015, .075, abs(radius - .78)),
                        (.35 + .65 * spokes) * (1 - smoothstep(.008, .035, abs(radius - .92))));
                }
                else if (_Shape < 2.5) // Trail strip
                {
                    color.rgb = lerp(color.rgb, half3(1, .89, .63), 1 - smoothstep(.05, .55, abs(p.y)));
                    color.a *= 1 - smoothstep(.12, .98, abs(p.y));
                }
                else if (_Shape < 3.5) // Static cell perimeter and corner ticks
                {
                    float2 edge = abs(p);
                    float perimeter = max(edge.x, edge.y);
                    float border = smoothstep(.81, .89, perimeter);
                    float corners = smoothstep(.50, .63, min(edge.x, edge.y));
                    color.a *= .07 + border * (.55 + .38 * corners);
                }
                // Higher values are solid tile and telegraph colors.
                return color;
            }
            ENDHLSL
        }
    }
}
