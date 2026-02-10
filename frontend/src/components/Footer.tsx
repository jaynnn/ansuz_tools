import React from 'react';
import '../styles/Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <span>© 2026 JaynAlpha. All rights reserved.</span>
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
        粤ICP备2025441624号-1
      </a>
    </footer>
  );
};

export default Footer;
