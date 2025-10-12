window.addEventListener('load', () => {
    const year = document.getElementById('year');
    if (year) {
        year.textContent = new Date().getFullYear();
    }

    const gsap = window.gsap;
    const scrollTrigger = window.ScrollTrigger;

    console.info('[landing] Initializing GSAP animations', {
        hasScrollTrigger: Boolean(scrollTrigger)
    });

    if (scrollTrigger) {
        gsap.registerPlugin(scrollTrigger);
    }

    const easeOut = 'power3.out';

    gsap.from('.hero__badge', {
        opacity: 0,
        y: -24,
        duration: 1.4,
        ease: easeOut
    });

    // Animate "Test Smarter," first
    const heroTitleLines = document.querySelectorAll('.hero__title');
    if (heroTitleLines.length > 0) {
        const titleElement = heroTitleLines[0];
        const accentElement = titleElement.querySelector('.hero__title-accent');
        
        // Fade in the first line "Test Smarter,"
        gsap.from(titleElement.childNodes[0], {
            opacity: 0,
            y: 50,
            duration: 1.2,
            ease: easeOut,
            delay: 0.2
        });

        // Infinite typing animation with word cycling
        if (accentElement) {
            const words = [
                'Learn Better',
                'Grow Faster',
                'Achieve More',
                'Succeed Quickly',
                'Master Skills',
                'Progress Daily'
            ];
            
            let currentIndex = 0;
            accentElement.textContent = '';
            accentElement.style.opacity = '1';
            
            // Create cursor element
            const cursor = document.createElement('span');
            cursor.textContent = '|';
            cursor.style.marginLeft = '2px';
            cursor.style.display = 'inline-block';
            
            // Cursor blinking animation
            gsap.to(cursor, {
                opacity: 0,
                duration: 0.5,
                repeat: -1,
                yoyo: true,
                ease: 'power1.inOut'
            });
            
            function typeWord(word, onComplete) {
                accentElement.textContent = '';
                accentElement.appendChild(cursor);
                
                gsap.to({}, {
                    duration: word.length * 0.1,
                    ease: 'none',
                    onUpdate: function() {
                        const progress = this.progress();
                        const currentLength = Math.floor(progress * word.length);
                        const textNode = accentElement.childNodes[0];
                        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                            textNode.textContent = word.substring(0, currentLength);
                        } else {
                            accentElement.insertBefore(
                                document.createTextNode(word.substring(0, currentLength)),
                                cursor
                            );
                        }
                    },
                    onComplete: onComplete
                });
            }
            
            function eraseWord(onComplete) {
                const textNode = accentElement.childNodes[0];
                if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
                    onComplete();
                    return;
                }
                
                const currentText = textNode.textContent;
                
                gsap.to({}, {
                    duration: currentText.length * 0.05,
                    ease: 'none',
                    onUpdate: function() {
                        const progress = this.progress();
                        const remainingLength = Math.floor((1 - progress) * currentText.length);
                        textNode.textContent = currentText.substring(0, remainingLength);
                    },
                    onComplete: onComplete
                });
            }
            
            function cycleWords() {
                const currentWord = words[currentIndex];
                
                typeWord(currentWord, () => {
                    setTimeout(() => {
                        eraseWord(() => {
                            currentIndex = (currentIndex + 1) % words.length;
                            cycleWords();
                        });
                    }, 2000); // Pause for 2 seconds after typing
                });
            }
            
            // Start the cycle after initial delay
            setTimeout(() => {
                cycleWords();
            }, 1200);
        }
    }

    gsap.from('.hero__subtitle', {
        opacity: 0,
        y: 60,
        duration: 1.3,
        ease: easeOut,
        delay: 1.8
    });

    gsap.from('.hero__actions .hero__btn', {
        opacity: 0,
        y: 50,
        duration: 1.2,
        ease: easeOut,
        delay: 0.6,
        stagger: 0.25
    });

    if (!scrollTrigger) {
        return;
    }

    scrollTrigger.defaults({
        toggleActions: 'play none none reverse'
    });

    document.querySelectorAll('.section').forEach((section) => {
        const header = section.querySelector('.section__header');
        if (!header) return;

        gsap.from(header, {
            opacity: 0,
            y: 60,
            duration: 1.6,
            ease: easeOut,
            immediateRender: false,
            scrollTrigger: {
                trigger: section,
                start: 'top 75%'
            }
        });
    });

    const modernSection = document.querySelector('.section--light');
    const modernSectionhead = modernSection ? modernSection.querySelector('.section__header') : null;
    const modernBadges = modernSection ? Array.from(modernSection.querySelectorAll('.pill-badge')) : [];
    const modernGrids = modernSection ? Array.from(modernSection.querySelectorAll('.feature-grid')) : [];

    if (modernSectionhead){
        gsap.from(modernSectionhead, {
            x: 80,
            duration: 2.0,
            immediateRender: false,
            scrollTrigger: {
                trigger: modernSectionhead,
                start: 'top 75%',
                once: true
            }
        });
    }

    if(modernBadges[0]) {
        gsap.from(modernBadges[0], {
            autoAlpha: 0,
            y: 50,
            duration: 1.2,
            ease: easeOut,
            immediateRender: false,
            scrollTrigger: {
                trigger: modernBadges[0],
                start: 'top 80%',
                once: true
            }
        });
    }

    if(modernGrids[0]) {
        gsap.from(modernGrids[0].querySelectorAll('.feature-card'), {
            autoAlpha: 0,
            y: 50,
            duration: 1.3,
            ease: easeOut,
            stagger: 0.18,
            immediateRender: false,
            scrollTrigger: {
                trigger: modernGrids[0],
                start: 'top 78%',
                once: true
            }
        });
    }

    if(modernBadges[1]) {
        gsap.from(modernBadges[1], {
            autoAlpha: 0,
            y: 50,
            duration: 1.2,
            ease: easeOut,
            immediateRender: false,
            scrollTrigger: {
                trigger: modernBadges[1],
                start: 'top 80%',
                once: true
            }
        });
    }

    if(modernGrids[1]) {
        gsap.from(modernGrids[1].querySelectorAll('.feature-card'), {
            autoAlpha: 0,
            y: 50,
            duration: 1.3,
            ease: easeOut,
            stagger: 0.18,
            immediateRender: false,
            scrollTrigger: {
                trigger: modernGrids[1],
                start: 'top 78%',
                once: true
            }
        });
    }

    // gsap.utils.toArray('.pill-badge').forEach((badge) => {
    //     if (modernBadges.includes(badge)) return;

    //     gsap.from(badge, {
    //         opacity: 0,
    //         y: 32,
    //         duration: 0.8,
    //         ease: easeOut,
    //         scrollTrigger: {
    //             trigger: badge,
    //             start: 'top 80%',
    //             once: true
    //         }
    //     });
    // });

    // gsap.utils.toArray('.feature-grid').forEach((grid) => {
    //     if (modernGrids.includes(grid)) return;

    //     const cards = grid.querySelectorAll('.feature-card');
    //     if (!cards.length) return;

    //     gsap.from(cards, {
    //         opacity: 0,
    //         y: 70,
    //         duration: 1,
    //         ease: easeOut,
    //         stagger: 0.12,
    //         scrollTrigger: {
    //             trigger: grid,
    //             start: 'top 82%',
    //             once: true
    //         }
    //     });
    // });

    gsap.from('.section--halo .logo-strip__item', {
        opacity: 0,
        y: 60,
        rotateX: 18,
        duration: 1.3,
        ease: easeOut,
        stagger: 0.15,
        scrollTrigger: {
            trigger: '.section--halo',
            start: 'top 82%'
        }
    });

    gsap.from('.section--cta .cta__content', {
        opacity: 0,
        y: 70,
        duration: 1.4,
        ease: easeOut,
        scrollTrigger: {
            trigger: '.section--cta',
            start: 'top 85%'
        }
    });

    gsap.from('.section--cta .cta__btn', {
        opacity: 0,
        y: 60,
        duration: 1.2,
        ease: easeOut,
        stagger: 0.22,
        delay: 0.15,
        scrollTrigger: {
            trigger: '.section--cta',
            start: 'top 82%'
        }
    });

    scrollTrigger.refresh();
});
